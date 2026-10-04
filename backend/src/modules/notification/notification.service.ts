import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../user/user.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** 内部调用:发送单条通知 */
  async send(data: {
    userId: string;
    type: NotificationType;
    title: string;
    content: string;
    relatedId?: string;
    relatedType?: string;
  }): Promise<Notification> {
    const n = this.repo.create(data);
    return this.repo.save(n);
  }

  /** 广播给所有用户(管理员用) */
  async broadcast(data: {
    type: NotificationType;
    title: string;
    content: string;
  }): Promise<number> {
    const users = await this.userRepo.find({ where: { status: 'active' } });
    const notifications = users.map((u) =>
      this.repo.create({ ...data, userId: u.id }),
    );
    const saved = await this.repo.save(notifications);
    return saved.length;
  }

  /** 获取用户通知列表 */
  async listForUser(
    userId: string,
    opts: { unreadOnly?: boolean; page?: number; size?: number },
  ) {
    const page = opts.page ?? 1;
    const size = opts.size ?? 20;
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC');

    if (opts.unreadOnly) {
      qb.andWhere('n.readAt IS NULL');
    }

    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * size)
      .take(size)
      .getMany();

    return { items, total, page, size };
  }

  /** 未读数 */
  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({
      where: { userId, readAt: IsNull() },
    });
  }

  /** 标记单条已读 */
  async markRead(id: string, userId: string): Promise<void> {
    await this.repo.update({ id, userId }, { readAt: new Date() });
  }

  /** 标记全部已读 */
  async markAllRead(userId: string): Promise<void> {
    await this.repo.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
  }
}
