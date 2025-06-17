import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Channel } from 'diagnostics_channel';
import mongoose, { Model } from 'mongoose';
import { Poem } from 'src/bot/schema/bot.schema';
import { ChannelDocument } from 'src/channel/schema/channel.schema';
import ApiFeatures, { QueryString } from 'utils/apiFeatures';
import { isValidId } from 'utils/objectIdValidator';

@Injectable()
export class PoemsService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(Poem.name) private readonly poemModel: Model<Poem>,
    @InjectModel(Channel.name)
    private readonly channelModel: Model<ChannelDocument>,
  ) {}

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

  async getPoem(id: string) {
    isValidId('Poem', id);
    const poem = await this.poemModel.findById(id);
    if (!poem) throw new NotFoundException('Poem Not Found!');
    return poem;
  }

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

  async getChannel(id: string) {
    isValidId('Channel', id);
    const channel = await this.channelModel.findById(id);
    if (!channel) throw new NotFoundException('Channel Not Found!');
    return channel;
  }

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
