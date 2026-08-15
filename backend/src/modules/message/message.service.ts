import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { User } from '../user/user.entity';
import { NotificationService } from '../notification/notification.service';
import { SendMessageDto } from './message.dto';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** 找到或创建会话(保证两用户间唯一会话,可选按 jobId 区分) */
  async findOrCreateConversation(
    userAId: string,
    userBId: string,
    jobId?: string | null,
    applicationId?: string | null,
  ): Promise<Conversation> {
    if (userAId === userBId) {
      throw new BadRequestException('不能与自己发起会话');
    }
    const other = await this.userRepo.findOne({ where: { id: userBId } });
    if (!other) throw new NotFoundException('对方用户不存在');

    // 双向查找已有会话(同 jobId 维度)
    const jobCond = jobId ? { jobId } : { jobId: IsNull() };
    const findConv = () =>
      this.convRepo.findOne({
        where: [
          { userAId, userBId, ...jobCond },
          { userAId: userBId, userBId: userAId, ...jobCond },
        ],
      });
    let conv = await findConv();

    if (!conv) {
      try {
        conv = this.convRepo.create({
          userAId,
          userBId,
          jobId: jobId ?? null,
          applicationId: applicationId ?? null,
        });
        conv = await this.convRepo.save(conv);
      } catch (err) {
        // 并发创建撞唯一约束时回读已有会话,而不是返回 500
        if ((err as { code?: string })?.code === '23505') {
          conv = await findConv();
          if (!conv) throw err;
        } else {
          throw err;
        }
      }
    }
    return conv;
  }

  /** 发送消息 */
  async sendMessage(senderId: string, dto: SendMessageDto): Promise<Message> {
    let conv: Conversation;
    if (dto.conversationId) {
      const found = await this.convRepo.findOne({
        where: { id: dto.conversationId },
      });
      if (!found) throw new NotFoundException('会话不存在');
      // 校验是会话参与者
      if (found.userAId !== senderId && found.userBId !== senderId) {
        throw new ForbiddenException('无权在此会话发送消息');
      }
      conv = found;
    } else if (dto.receiverId) {
      conv = await this.findOrCreateConversation(
        senderId,
        dto.receiverId,
        dto.jobId,
      );
    } else {
      throw new BadRequestException('需提供 conversationId 或 receiverId');
    }

    const receiverId = conv.userAId === senderId ? conv.userBId : conv.userAId;

    // 事务内完成 消息保存 + 未读数原子自增,避免基于旧实体读-改-写丢失并发计数
    const saved = await this.dataSource.transaction(async (manager) => {
      const msg = this.msgRepo.create({
        conversationId: conv.id,
        senderId,
        content: dto.content,
      });
      const s = await manager.save(msg);

      const unreadDbCol = conv.userAId === senderId ? 'unread_b' : 'unread_a';
      const patch: Record<string, unknown> = {
        lastMessageAt: () => 'NOW()',
      };
      patch[unreadDbCol] = () => `${unreadDbCol} + 1`;
      await manager
        .createQueryBuilder()
        .update(Conversation)
        .set(patch)
        .where('id = :id', { id: conv.id })
        .execute();

      return s;
    });

    // 通知对方(通知失败不影响消息本身)
    const sender = await this.userRepo.findOne({ where: { id: senderId } });
    this.notificationService
      .send({
        userId: receiverId,
        type: 'message',
        title: '收到新消息',
        content: `${sender?.username || '用户'}给您发来一条消息`,
        relatedId: conv.id,
        relatedType: 'conversation',
      })
      .catch((err) =>
        console.error(
          `[Message] Notification failed for ${conv.id}:`,
          (err as Error).message,
        ),
      );

    return saved;
  }

  /** 我的会话列表(带对方信息和最新消息) */
  async listConversations(userId: string) {
    const convs = await this.convRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.userA', 'userA')
      .leftJoinAndSelect('c.userB', 'userB')
      .where('c.userAId = :userId OR c.userBId = :userId', { userId })
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .getMany();

    // 取每个会话最新一条消息
    const result = await Promise.all(
      convs.map(async (c) => {
        const lastMsg = await this.msgRepo.findOne({
          where: { conversationId: c.id },
          order: { createdAt: 'DESC' },
        });
        const otherUser = c.userAId === userId ? c.userB : c.userA;
        const unread = c.userAId === userId ? c.unreadA : c.unreadB;
        return {
          id: c.id,
          otherUser: otherUser
            ? {
                id: otherUser.id,
                username: otherUser.username,
                role: otherUser.role,
                companyName: otherUser.companyName,
              }
            : null,
          jobId: c.jobId,
          unread,
          lastMessage: lastMsg
            ? {
                content: lastMsg.content,
                createdAt: lastMsg.createdAt,
                senderId: lastMsg.senderId,
              }
            : null,
          lastMessageAt: c.lastMessageAt,
          createdAt: c.createdAt,
        };
      }),
    );
    return result;
  }

  /** 获取会话消息(分页),并标记己方已读 */
  async getMessages(
    conversationId: string,
    userId: string,
    page = 1,
    size = 50,
  ) {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (conv.userAId !== userId && conv.userBId !== userId) {
      throw new ForbiddenException('无权查看此会话');
    }

    const [items, total] = await this.msgRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .where('m.conversationId = :conversationId', { conversationId })
      .orderBy('m.createdAt', 'ASC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    // 标记己方未读清零
    const patch: Partial<Conversation> = {};
    if (conv.userAId === userId) {
      if (conv.unreadA > 0) patch.unreadA = 0;
    } else {
      if (conv.unreadB > 0) patch.unreadB = 0;
    }
    if (Object.keys(patch).length > 0) {
      await this.convRepo.update(conv.id, patch);
    }

    return { items, total, page, size };
  }

  /** 未读消息总数 */
  async unreadTotal(userId: string): Promise<number> {
    const convs = await this.convRepo.find({
      where: [{ userAId: userId }, { userBId: userId }],
    });
    return convs.reduce((sum, c) => {
      return sum + (c.userAId === userId ? c.unreadA : c.unreadB);
    }, 0);
  }
}
