import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AssignEngagementConversationSchema,
  AssignInteractionSchema,
  CreateEngagementAutomationRuleSchema,
  CreateInteractionSchema,
  LogPhoneInteractionSchema,
  PaginationQuerySchema,
  ResolveInteractionSchema,
  UpdateEngagementAutomationRuleSchema,
  UpdateEngagementConversationSchema,
  UpdateInteractionSchema,
} from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { InteractionsService } from './interactions.service';
import { EngagementAutomationService } from './engagement-automation.service';

@Controller('interactions')
@RequireAgencyOrg()
export class InteractionsController {
  constructor(
    private interactions: InteractionsService,
    private automation: EngagementAutomationService,
  ) {}

  @Post()
  @RequirePermissions('lead.write', 'inquiry.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.interactions.create(user, CreateInteractionSchema.parse(body));
  }

  @Post('phone')
  @RequirePermissions('lead.write', 'inquiry.write')
  logPhone(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.interactions.logPhoneCall(user, LogPhoneInteractionSchema.parse(body));
  }

  @Get()
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = PaginationQuerySchema.parse(query);
    const extra = query as {
      channel?: string;
      unread?: string;
      outcome?: string;
      ownership?: string;
    };
    const ownership =
      extra.ownership === 'mine' || extra.ownership === 'unassigned'
        ? extra.ownership
        : 'all';
    return this.interactions.list(user, {
      page: q.page,
      pageSize: q.pageSize,
      q: q.q,
      channel: extra.channel,
      outcome: extra.outcome,
      ownership,
      unread: extra.unread === '1' || extra.unread === 'true' ? true : undefined,
    });
  }

  @Get('threads')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  listThreads(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = PaginationQuerySchema.parse(query);
    const extra = query as {
      channel?: string;
      unread?: string;
      ownership?: string;
      queue?: string;
    };
    const ownership =
      extra.ownership === 'mine' || extra.ownership === 'unassigned'
        ? extra.ownership
        : 'all';
    const queue =
      extra.queue === 'assigned' ||
      extra.queue === 'waiting' ||
      extra.queue === 'follow_up'
        ? extra.queue
        : 'all';
    return this.interactions.listThreads(user, {
      page: q.page,
      pageSize: q.pageSize,
      channel: extra.channel,
      ownership,
      queue,
      unread: extra.unread === '1' || extra.unread === 'true' ? true : undefined,
    });
  }

  @Get('threads/:threadKey')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  threadMessages(@CurrentUser() user: AuthUser, @Param('threadKey') threadKey: string) {
    return this.interactions.listThreadMessages(user, decodeURIComponent(threadKey));
  }

  @Get('conversations/:id')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  getConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interactions.getConversation(user, id);
  }

  @Patch('conversations/:id')
  @RequirePermissions('lead.write', 'inquiry.write')
  updateConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.updateConversation(
      user,
      id,
      UpdateEngagementConversationSchema.parse(body),
    );
  }

  @Post('conversations/:id/claim')
  @RequirePermissions('lead.write', 'inquiry.write')
  claimConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interactions.claimConversation(user, id);
  }

  @Post('conversations/:id/assign')
  @RequirePermissions('lead.assign')
  assignConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = AssignEngagementConversationSchema.parse(body);
    return this.interactions.assignConversation(user, id, parsed.staffUserId);
  }

  @Get('channel-unread')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  channelUnread(@CurrentUser() user: AuthUser) {
    return this.interactions.channelUnreadSummary(user);
  }

  @Get('analytics/summary')
  @RequirePermissions('report.sales.read')
  analytics(@CurrentUser() user: AuthUser) {
    return this.interactions.analyticsSummary(user);
  }

  @Get('analytics/journeys')
  @RequirePermissions('report.sales.read')
  journeys(@CurrentUser() user: AuthUser) {
    return this.interactions.journeyAnalytics(user);
  }

  @Get('connectors/capabilities')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  connectorCapabilities() {
    return this.interactions.connectorCapabilities();
  }

  @Get('automation-rules')
  @RequirePermissions('org.settings.write')
  listAutomationRules(@CurrentUser() user: AuthUser) {
    return this.automation.list(user);
  }

  @Post('automation-rules')
  @RequirePermissions('org.settings.write')
  createAutomationRule(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.automation.create(user, CreateEngagementAutomationRuleSchema.parse(body));
  }

  @Patch('automation-rules/:id')
  @RequirePermissions('org.settings.write')
  updateAutomationRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.automation.update(
      user,
      id,
      UpdateEngagementAutomationRuleSchema.parse(body),
    );
  }

  @Get(':id')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interactions.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('lead.write', 'inquiry.write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.interactions.update(user, id, UpdateInteractionSchema.parse(body));
  }

  @Post(':id/resolve')
  @RequirePermissions('lead.write', 'inquiry.write')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.interactions.resolve(user, id, ResolveInteractionSchema.parse(body));
  }

  @Post(':id/read')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interactions.markRead(user, id);
  }

  @Post(':id/claim')
  @RequirePermissions('lead.write', 'inquiry.write')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interactions.claim(user, id);
  }

  @Post(':id/assign')
  @RequirePermissions('lead.assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = AssignInteractionSchema.parse(body);
    return this.interactions.assign(user, id, parsed.staffUserId);
  }
}
