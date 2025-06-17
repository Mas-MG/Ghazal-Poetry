import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { PoemsService } from './poems.service';
import { QueryString } from 'utils/apiFeatures';
import { AuthGuard } from 'src/auth/guards';

// 📌 Swagger tag for grouping endpoints under "Poems" section
@ApiTags('Poems')

// 🔐 Enables JWT bearer token authentication in Swagger UI
@ApiBearerAuth()

// 🔒 Apply custom AuthGuard to all routes in this controller
@UseGuards(AuthGuard)

// 🎯 Root-level controller (no base route prefix)
@Controller()
export class PoemsController {
  constructor(private poemsService: PoemsService) {}

  /**
   * GET /poems
   * 🔍 Returns all poems with support for query features (filtering, sorting, pagination, etc.)
   */
  @Get('poems')
  @ApiOperation({ summary: 'Get all poems' })
  async getAllPoems(@Query() query: QueryString) {
    const poems = await this.poemsService.getAllPoems(query);
    return { poems };
  }

  /**
   * GET /poems/id/:id
   * 📖 Returns a single poem by its MongoDB ID
   */
  @Get('/poems/id/:id')
  @ApiOperation({ summary: 'Get a poem by ID' })
  async getPoem(@Param('id') id: string) {
    const poem = await this.poemsService.getPoem(id);
    return { poem };
  }

  /**
   * GET /channels
   * 📡 Fetches all channels with optional filters/pagination
   */
  @Get('/channels')
  @ApiOperation({ summary: 'Get all channels' })
  async getAllChannels(@Query() query: QueryString) {
    const channels = await this.poemsService.getAllChannels(query);
    return { channels };
  }

  /**
   * GET /channels/:id
   * 🎯 Fetches a specific channel by its MongoDB ID
   */
  @Get('/channels/:id')
  @ApiOperation({ summary: 'Get a channel by ID' })
  async getChannel(@Param('id') id: string) {
    const channel = await this.poemsService.getChannel(id);
    return { channel };
  }

  /**
   * GET /poems/category/:category
   * 🗂 Returns poems filtered by category with optional query features
   */
  @Get('/poems/category/:category')
  @ApiOperation({ summary: 'Get poems by category' })
  async getPoemsByCategory(
    @Param('category') category: string,
    @Query() query: QueryString,
  ) {
    const poems = await this.poemsService.getPoemsByCategory(category, query);
    return { poems };
  }

  /**
   * GET /poems/unapproved
   * 🚫 Returns poems that have not been approved yet (for admin moderation)
   */
  @Get('poems/unapproved')
  @ApiOperation({ summary: 'Get unapproved poems' })
  async getUnapprovedPoems(@Query() query: QueryString) {
    const poems = await this.poemsService.getUnapprovedPoems(query);
    return { poems };
  }
}
