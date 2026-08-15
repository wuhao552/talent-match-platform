import {
  Controller,
  Get,
  Patch,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const data = await this.notificationService.listForUser(userId, {
      unreadOnly: unreadOnly === 'true',
      page: page ? Number(page) : 1,
      size: size ? Number(size) : 20,
    });
    return { code: 200, message: 'ok', data };
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser('id') userId: string) {
    const count = await this.notificationService.unreadCount(userId);
    return { code: 200, message: 'ok', data: { count } };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.notificationService.markRead(id, userId);
    return { code: 200, message: '已标记为已读', data: null };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser('id') userId: string) {
    await this.notificationService.markAllRead(userId);
    return { code: 200, message: '全部已标记为已读', data: null };
  }
}
