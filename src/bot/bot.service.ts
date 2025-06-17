import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Poem } from './schema/bot.schema';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { Channel, ChannelDocument } from '../channel/schema/channel.schema';

// Marks this service as injectable in NestJS
@Injectable()
export class PoemSchedulerService {
  constructor(
    private readonly config: ConfigService,

    // Inject Mongoose model for Poem schema
    @InjectModel(Poem.name)
    private readonly poemModel: Model<Poem>,

    // Inject Mongoose model for Channel schema
    @InjectModel(Channel.name)
    private readonly channelModel: Model<ChannelDocument>,

    // Inject Telegraf bot instance
    @InjectBot()
    private readonly bot: Telegraf,
  ) {}

  /**
   * Sends a random approved poem to each eligible channel based on time and category filters.
   */
  private async sendRandomPoemsToChannels() {
    const now = new Date();
    const hour = now.getHours(); // Current hour (0–23)

    // Fetch all configured channels
    const allChannels = await this.channelModel.find().lean();

    for (const channel of allChannels) {
      // Extract and parse time range (e.g., "6_18" means 6 AM to 6 PM)
      const [start, end] = channel.timeRange.split('_').map(Number);
      const endHour = end === 24 ? 0 : end;

      // Determine if current time falls within this channel's active range
      const isInTimeRange =
        start < endHour
          ? hour >= start && hour < endHour
          : hour >= start || hour < endHour;

      // Send poem every 3 hours within time range
      const shouldSendThisHour = isInTimeRange && (hour - start + 24) % 3 === 0;

      if (!shouldSendThisHour) continue;

      // Build query to find poems that:
      // - are approved
      // - have NOT been sent to this channel yet
      const query: any = {
        approved: true,
        channels: { $ne: channel.channelId },
      };

      // If channel has specific categories selected, apply filter
      if (!channel.allCategories && channel.categories?.length) {
        query.category = { $in: channel.categories };
      }

      const count = await this.poemModel.countDocuments(query);
      if (!count) continue;

      // Pick a random poem from matched results
      const randomIndex = Math.floor(Math.random() * count);
      const poem = await this.poemModel.findOne(query).skip(randomIndex).lean();
      if (!poem) continue;

      // Mark the poem as sent to this channel to prevent duplicates
      await this.poemModel.findByIdAndUpdate(poem._id, {
        $addToSet: { channels: channel.channelId },
      });

      const message = `${poem.text}\n\n- ${poem.poet || 'نامشخص'}`;

      try {
        await this.bot.telegram.sendMessage(channel.channelId, message);
      } catch (err) {
        console.error(
          `❌ Failed to send to channel ${channel.channelId}:`,
          err.message,
        );
      }
    }
  }

  /**
   * Runs the scheduler every hour at minute 0 (e.g., 10:00, 11:00, etc.)
   */
  @Cron('0 * * * *') // every hour at minute 0
  async sendEveryHour() {
    await this.sendRandomPoemsToChannels();
  }

  // 🔄 For debugging purposes: send every 10 seconds (commented out)
  // @Cron('*/10 * * * * *')
  // async sendEvery10Seconds() {
  //   await this.sendRandomPoemsToChannels();
  // }
}
