import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Poem } from './schema/bot.schema';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';

@Injectable()
export class PoemSchedulerService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(Poem.name) private readonly poemModel: Model<Poem>,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  private async sendRandomPoem() {
    const count = await this.poemModel.countDocuments({
      approved: true,
      isPublished: false,
    });
    if (count === 0) return;

    const randomIndex = Math.floor(Math.random() * count);
    const poem = await this.poemModel
      .findOne({ approved: true, isPublished: false })
      .skip(randomIndex)
      .lean();

    if (!poem) return;
    await this.poemModel.findByIdAndUpdate(poem._id, { isPublished: true });

    const channelId = this.config.get('TELEGRAM_CHANNEL_ID');

    const message = `📝 شعر تصادفی:\n\n${poem.text}\n— شاعر: ${poem.poet || 'نامشخص'}\n— دسته: ${poem.category || 'نامشخص'}`;

    await this.bot.telegram.sendMessage(channelId, message);
  }

  @Cron('0 6-12/3 * * *')
  async sendEvery3HoursBetween6And12() {
    await this.sendRandomPoem();
  }
}
