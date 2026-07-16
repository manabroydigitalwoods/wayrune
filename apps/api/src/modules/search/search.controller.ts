import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/helpers';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  query(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('types') types?: string,
  ) {
    return this.search.search(user, q || '', types);
  }
}
