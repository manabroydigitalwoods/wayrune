import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateInquirySchema,
  InquiryListQuerySchema,
  UpdateInquirySchema,
  UpdateInquiryStatusSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
@RequireAgencyOrg()
export class InquiriesController {
  constructor(private inquiries: InquiriesService) {}

  @Post()
  @RequirePermissions('inquiry.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.inquiries.create(user, CreateInquirySchema.parse(body));
  }

  @Get('queue-summary')
  @RequirePermissions('inquiry.read')
  queueSummary(@CurrentUser() user: AuthUser) {
    return this.inquiries.queueSummary(user.organizationId, user.sub);
  }

  @Get()
  @RequirePermissions('inquiry.read')
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = InquiryListQuerySchema.parse(query);
    let ownerId: string | null | undefined;
    if (q.ownerId === 'me') ownerId = user.sub;
    else if (q.ownerId === 'unassigned') ownerId = null;
    else ownerId = q.ownerId;

    return this.inquiries.list(user.organizationId, q.page, q.pageSize, {
      q: q.q,
      status: q.status,
      queue: q.queue,
      ownerId,
      incomplete: q.incomplete,
      stale: q.stale,
      viewerUserId: user.sub,
    });
  }

  @Get(':id')
  @RequirePermissions('inquiry.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inquiries.get(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('inquiry.write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.inquiries.update(user, id, UpdateInquirySchema.parse(body));
  }

  @Post(':id/status')
  @RequirePermissions('inquiry.write')
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.inquiries.updateStatus(user, id, UpdateInquiryStatusSchema.parse(body));
  }

  @Post(':id/clone')
  @RequirePermissions('inquiry.write')
  clone(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inquiries.clone(user, id);
  }

  @Post(':id/convert-to-trip')
  @RequirePermissions('inquiry.write', 'trip.write')
  convert(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inquiries.convertToTrip(user, id);
  }
}
