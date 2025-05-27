// bot/poem-scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { Poem } from './schema/bot.schema';

@Injectable()
export class PoemSchedulerService {
  private readonly logger = new Logger(PoemSchedulerService.name);
  private readonly bot: Telegraf;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Poem.name) private readonly poemModel: Model<Poem>,
  ) {
    this.bot = new Telegraf(this.config.get<string>('TELEGRAM_BOT_TOKEN')!);
  }

  @Interval(.15 * 60 * 1000) // Every 2 minutes
  async sendNextPoem() {
    const groupId = this.config.get<string>('TELEGRAM_GROUP_ID');
    if (!groupId) return;

    // Find one unsent poem
    const poems = await this.poemModel
      .find({ sent: { $ne: true } })
      .sort({ createdAt: 1 });

    if (poems.length <= 0) {
      this.logger.log('No new poems to send.');
      return;
    }

    try {
      poems.map((poem) => {
        (async () => {
          await this.bot.telegram.sendMessage(groupId, poem?.text, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ تایید', callback_data: `approve_${poem._id}` },

                ],
                [
                  { text: '✏ ویرایش', callback_data: `edit_${poem._id}` },
                ],
                [
                  { text: '🗑 حذف', callback_data: `delete_${poem._id}` },
                ],
              ],
            },
          });

          // Mark as sent
          poem.sent = true;
          await poem.save();
        })();

        this.logger.log(`Sent poem: ${poem.text}`);
      });
    } catch (error) {
      this.logger.error('Failed to send poem:', error);
    }
  }
}
