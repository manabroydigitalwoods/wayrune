import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateTaskSchema } from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { TasksService } from './tasks.service';

@Controller('tasks')
@RequireAgencyOrg()
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Post()
  @RequirePermissions('task.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.tasks.create(user.organizationId, user.sub, CreateTaskSchema.parse(body));
  }

  @Get()
  @RequirePermissions('task.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('due') due?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.tasks.list(user.organizationId, status, q, due, entityType, entityId);
  }

  @Post(':id/complete')
  @RequirePermissions('task.write')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.complete(user.organizationId, user.sub, id);
  }
}
