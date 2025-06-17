import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Poem } from 'src/bot/schema/bot.schema';
import { Channel, ChannelDocument } from 'src/channel/schema/channel.schema';
import ApiFeatures, { QueryString } from 'utils/apiFeatures';
import { isValidId } from 'utils/objectIdValidator';

@Injectable()
export class PoemsService {
  constructor(
    private readonly config: ConfigService,

    // Inject Mongoose model for poems
    @InjectModel(Poem.name)
    private readonly poemModel: Model<Poem>,

    // Inject Mongoose model for channels
    @InjectModel(Channel.name)
    private readonly channelModel: Model<ChannelDocument>,
  ) {}

  /**
   * Retrieves all poems using query features: filtering, sorting, field limiting, pagination.
   */
  async getAllPoems(query: QueryString) {
    const features = new ApiFeatures(this.poemModel, query)
      .filters()
      .sort()
      .limitFields()
      .populate()
      .paginate();

    const poems = await features.model;

    if (poems.length <= 0) {
      throw new NotFoundException('No Poem Found!');
    }

    return poems;
  }

  /**
   * Retrieves a single poem by its ID after validating it.
   */
  async getPoem(id: string) {
    isValidId('Poem', id); // Check if ID is a valid MongoDB ObjectId
    const poem = await this.poemModel.findById(id);

    if (!poem) throw new NotFoundException('Poem Not Found!');
    return poem;
  }

  /**
   * Retrieves all channels with optional query features (filtering, sorting, etc.)
   */
  async getAllChannels(query: QueryString) {
    const features = new ApiFeatures(this.channelModel, query)
      .filters()
      .sort()
      .limitFields()
      .populate()
      .paginate();

    const channels = await features.model;

    if (channels.length <= 0) {
      throw new NotFoundException('No Channel Found!');
    }

    return channels;
  }

  /**
   * Retrieves a single channel by its ID after validating it.
   */
  async getChannel(id: string) {
    isValidId('Channel', id);
    const channel = await this.channelModel.findById(id);

    if (!channel) throw new NotFoundException('Channel Not Found!');
    return channel;
  }

  /**
   * Retrieves all poems that belong to a specific category with optional filters.
   */
  async getPoemsByCategory(category: string, query: QueryString) {
    const features = new ApiFeatures(this.poemModel.find({ category }), query)
      .filters()
      .sort()
      .limitFields()
      .populate()
      .paginate();

    const poems = await features.model;

    if (poems.length <= 0) {
      throw new NotFoundException('No Poem Found!');
    }

    return poems;
  }

  /**
   * Retrieves all unapproved poems (e.g., for admin moderation).
   */
  async getUnapprovedPoems(query: QueryString) {
    const features = new ApiFeatures(
      this.poemModel.find({ approved: false }),
      query,
    )
      .filters()
      .sort()
      .limitFields()
      .populate()
      .paginate();

    const poems = await features.model;

    if (poems.length <= 0) {
      throw new NotFoundException('No Poem Found!');
    }

    return poems;
  }
}
