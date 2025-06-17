import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PoemsService } from './poems.service';
import { QueryString } from 'utils/apiFeatures';
import { ObjectId } from 'mongoose';
import { AuthGuard } from 'src/auth/guards';

@UseGuards(AuthGuard)
@Controller('poems')
export class PoemsController {
  constructor(private poemsService: PoemsService) {}

  // get all poems (sent by all telegram users)
  @Get()
  async getAllPoems(@Query() query: QueryString) {
    return this.poemsService.getAllPoems(query);
  }

  // get specific poem
  @Get(':id')
  async getPoem(@Param('id') id: string) {
    return this.poemsService.getPoem(id);
  }

  // get channels who have added Ghazal bot (to send schduelded poems)
  @Get()
  async getAllChannels(@Query() query: QueryString) {
    return this.poemsService.getAllChannels(query);
  }

  // get specific channel
  @Get(':id')
  async getChannel(@Param('id') id: string) {
    return this.poemsService.getChannel(id);
  }

  // get poems by category
  @Get('/all/:category')
  async getPoemsByCategory(
    @Param('category') category: string,
    @Query() query: QueryString,
  ) {
    return this.poemsService.getPoemsByCategory(category, query);
  }

  // get all approved poems
  @Get('/all/unapproved')
  async getUnapprovedPoems(@Query() query: QueryString) {
    return this.poemsService.getUnapprovedPoems(query);
  }
}
