import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/helpers';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.organizationId, user.sub);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.notifications.unreadCount(
      user.organizationId,
      user.sub,
    );
    return { count };
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.organizationId, user.sub);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.organizationId, user.sub, id);
  }
}
