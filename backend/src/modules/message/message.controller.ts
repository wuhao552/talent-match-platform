import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MessageService } from './message.service';
import {
  CreateConversationDto,
  SendMessageDto,
  MessageListDto,
} from './message.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private messageService: MessageService) {}

  /** 创建/获取会话 */
  @Post('conversations')
  async createConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    const data = await this.messageService.findOrCreateConversation(
      userId,
      dto.receiverId,
      dto.jobId,
      dto.applicationId,
    );
    return { code: 200, message: 'ok', data };
  }

  /** 我的会话列表 */
  @Get('conversations')
  async listConversations(@CurrentUser('id') userId: string) {
    const data = await this.messageService.listConversations(userId);
    return { code: 200, message: 'ok', data };
  }

  /** 会话消息(分页,读取时清未读) */
  @Get('conversations/:id')
  async getMessages(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query() query: MessageListDto,
  ) {
    const data = await this.messageService.getMessages(
      id,
      userId,
      query.page ? Number(query.page) : 1,
      query.size ? Number(query.size) : 50,
    );
    return { code: 200, message: 'ok', data };
  }

  /** 发送消息 */
  @Post()
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    const data = await this.messageService.sendMessage(userId, dto);
    return { code: 200, message: '发送成功', data };
  }

  /** 未读消息总数 */
  @Get('unread-count')
  async unreadTotal(@CurrentUser('id') userId: string) {
    const count = await this.messageService.unreadTotal(userId);
    return { code: 200, message: 'ok', data: { count } };
  }
}
