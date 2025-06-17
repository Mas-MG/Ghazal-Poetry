import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PoemsService } from './poems.service';
import { QueryString } from 'utils/apiFeatures';
import { AuthGuard } from 'src/auth/guards';

@ApiTags('Poems')
@ApiBearerAuth() // <- enables "Authorize" button in Swagger UI
@UseGuards(AuthGuard)
@Controller()
export class PoemsController {
  constructor(private poemsService: PoemsService) {}

  @Get('poems')
  @ApiOperation({ summary: 'Get all poems' })
  async getAllPoems(@Query() query: QueryString) {
    const poems = await this.poemsService.getAllPoems(query);
    return { poems };
  }

  @Get('/poems/id/:id')
  @ApiOperation({ summary: 'Get a poem by ID' })
  async getPoem(@Param('id') id: string) {
    const poem = await this.poemsService.getPoem(id);
    return { poem };
  }

  @Get('/channels')
  @ApiOperation({ summary: 'Get all channels' })
  async getAllChannels(@Query() query: QueryString) {
    const channels = await this.poemsService.getAllChannels(query);
    return { channels };
  }

  @Get('/channels/:id')
  @ApiOperation({ summary: 'Get a channel by ID' })
  async getChannel(@Param('id') id: string) {
    const channel = await this.poemsService.getChannel(id);
    return { channel };
  }

  @Get('/poems/category/:category')
  @ApiOperation({ summary: 'Get poems by category' })
  async getPoemsByCategory(
    @Param('category') category: string,
    @Query() query: QueryString,
  ) {
    const poems = await this.poemsService.getPoemsByCategory(category, query);
    return { poems };
  }

  @Get('poems/unapproved')
  @ApiOperation({ summary: 'Get unapproved poems' })
  async getUnapprovedPoems(@Query() query: QueryString) {
    const poems = await this.poemsService.getUnapprovedPoems(query);
    return { poems };
  }
}
