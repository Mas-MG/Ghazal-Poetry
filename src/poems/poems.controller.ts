import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PoemsService } from './poems.service';
import { QueryString } from 'utils/apiFeatures';
import { ObjectId } from 'mongoose';
import { AuthGuard } from 'src/auth/guards';

@UseGuards(AuthGuard)
@Controller()
export class PoemsController {
  constructor(private poemsService: PoemsService) {}

  // get all poems (sent by all telegram users)
  @Get('poems')
  async getAllPoems(@Query() query: QueryString) {
    const poems = await this.poemsService.getAllPoems(query);
    return { poems };
  }

  // get specific poem
  @Get('/poems/id/:id')
  async getPoem(@Param('id') id: string) {
    const poem = await this.poemsService.getPoem(id);
    return { poem };
  }

  // get channels who have added Ghazal bot (to send schduelded poems)
  @Get('/channels')
  async getAllChannels(@Query() query: QueryString) {
    const channels=await this.poemsService.getAllChannels(query);
    return {channels}
  }

  // get specific channel
  @Get('/channels/:id')
  async getChannel(@Param('id') id: string) {
    const channel= await this.poemsService.getChannel(id);
    return {channel}
  }

  // get poems by category
  @Get('/poems/category/:category')
  async getPoemsByCategory(
    @Param('category') category: string,
    @Query() query: QueryString,
  ) {
    const poems=await this.poemsService.getPoemsByCategory(category, query);
    return {poems}
  }

  // get all approved poems
  @Get('poems/unapproved')
  async getUnapprovedPoems(@Query() query: QueryString) {
    const poems=await this.poemsService.getUnapprovedPoems(query);
    return {poems}
  }
}
