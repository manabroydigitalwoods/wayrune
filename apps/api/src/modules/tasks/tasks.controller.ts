import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateTaskSchema, UpdateTaskSchema } from '@wayrune/contracts';
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
    @Query('dueFrom') dueFrom?: string,
    @Query('dueTo') dueTo?: string,
  ) {
    return this.tasks.list(
      user.organizationId,
      status,
      q,
      due,
      entityType,
      entityId,
      dueFrom?.trim() || null,
      dueTo?.trim() || null,
    );
  }

  @Patch(':id')
  @RequirePermissions('task.write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.tasks.update(user.organizationId, user.sub, id, UpdateTaskSchema.parse(body));
  }

  @Post(':id/complete')
  @RequirePermissions('task.write')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.complete(user.organizationId, user.sub, id);
  }
}
