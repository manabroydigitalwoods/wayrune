import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AssignPartyRoleSchema,
  CreatePartyAddressSchema,
  CreatePartyContactSchema,
  CreatePartySchema,
  ImportPartyCsvSchema,
  PartyListQuerySchema,
  UpdatePartySchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { PartiesService } from './parties.service';
import { InteractionsService } from '../interactions/interactions.service';

// Parties are the agency/DMC client CRM. Partners manage guests via the
// guest/stay models, so this surface is agency-only (matches leads/inquiries/
// trips) — a partner token can never reach it regardless of party.* perms.
@Controller('parties')
@RequireAgencyOrg()
export class PartiesController {
  constructor(
    private parties: PartiesService,
    private interactions: InteractionsService,
  ) {}

  @Post()
  @RequirePermissions('party.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.parties.create(
      user.organizationId,
      user.sub,
      CreatePartySchema.parse(body),
    );
  }

  @Post('import/csv')
  @RequirePermissions('party.write')
  importCsv(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.parties.importCsv(
      user.organizationId,
      user.sub,
      ImportPartyCsvSchema.parse(body),
    );
  }

  @Get()
  @RequirePermissions('party.read')
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = PartyListQuerySchema.parse(query);
    return this.parties.list(user.organizationId, {
      q: q.q,
      page: q.page,
      pageSize: q.pageSize,
      type: q.type,
      b2b: q.b2b,
    });
  }

  @Get(':id/journey')
  @RequirePermissions('party.read')
  journey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.interactions.journeyForParty(user.organizationId, id);
  }

  @Get(':id/credit-status')
  @RequirePermissions('party.read', 'finance.cost.read')
  creditStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('currency') currency?: string,
    @Query('pendingAmount') pendingAmount?: string,
  ) {
    const pending =
      pendingAmount != null && pendingAmount !== ''
        ? Number(pendingAmount)
        : undefined;
    return this.parties.creditStatus(user.organizationId, id, {
      orgCurrency: currency,
      pendingAmount:
        pending != null && Number.isFinite(pending) ? pending : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('party.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parties.get(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('party.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.parties.update(
      user.organizationId,
      user.sub,
      id,
      UpdatePartySchema.parse(body),
    );
  }

  @Post(':id/contacts')
  @RequirePermissions('party.write')
  addContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.parties.addContact(
      user.organizationId,
      id,
      CreatePartyContactSchema.parse(body),
    );
  }

  @Post(':id/addresses')
  @RequirePermissions('party.write')
  addAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.parties.addAddress(
      user.organizationId,
      id,
      CreatePartyAddressSchema.parse(body),
    );
  }

  @Post(':id/roles')
  @RequirePermissions('party.write')
  assignRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.parties.assignRole(
      user.organizationId,
      id,
      AssignPartyRoleSchema.parse(body),
    );
  }
}
