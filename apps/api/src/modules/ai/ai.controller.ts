import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  AssistRewriteSchema,
  AssistSummarizeSchema,
  GenerateProposalStorySchema,
} from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { AiService } from './ai.service';

@Controller('ai')
@RequireAgencyOrg()
export class AiController {
  constructor(private ai: AiService) {}

  @Get('status')
  @RequirePermissions('itinerary.edit', 'trip.write', 'trip.read')
  status() {
    return this.ai.status();
  }

  @Post('proposal-story')
  @RequirePermissions('itinerary.edit', 'trip.write')
  proposalStory(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.ai.generateProposalStory(
      user.organizationId,
      GenerateProposalStorySchema.parse(body),
    );
  }
}

@Controller('assist')
@RequireAgencyOrg()
export class AssistController {
  constructor(private ai: AiService) {}

  @Post('rewrite')
  @RequirePermissions('lead.write', 'inquiry.write')
  rewrite(@Body() body: unknown) {
    return this.ai.rewrite(AssistRewriteSchema.parse(body));
  }

  @Post('summarize')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  summarize(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.ai.summarize(user.organizationId, AssistSummarizeSchema.parse(body));
  }
}
