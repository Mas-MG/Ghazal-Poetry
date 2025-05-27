import { Update, On, Ctx, Start, Action } from 'nestjs-telegraf';
import { Injectable } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Poem } from './schema/bot.schema';
import { Model } from 'mongoose';

const waitingForPoem = new Map<number, boolean>();

@Update()
@Injectable()
export class BotUpdate {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(Poem.name) private readonly poemModel: Model<Poem>,
  ) {}

  @Start()
  async startCommand(@Ctx() ctx: Context) {
    await ctx.reply(
      'خوش اومدی، برای ارسال شعر روی دکمه زیر کلیک کن!',
      Markup.inlineKeyboard([
        Markup.button.callback('📝ارسال شعر', 'SEND_POEM'),
      ]),
    );
  }

  @Action('SEND_POEM')
  async sendPoem(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    waitingForPoem.set(userId, true);
    await ctx.answerCbQuery();
    await ctx.reply('هرچه دل تنگت میخواهد بگو...');
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const message = ctx.message;

    if (!message || !('text' in message) || message.chat.type !== 'private') {
      return;
    }

    const groupId = this.config.get<string>('TELEGRAM_GROUP_ID');
    if (!groupId) {
      throw new Error('TELEGRAM_GROUP_ID is not set in environment variables');
    }

    // const chatId = message.chat.id;
    // const messageId = message.message_id;

    const { id: userId, username, first_name, last_name } = message.from;
    const { text } = message;

    await this.poemModel.create({
      userId,
      username,
      firstName: first_name,
      lastName: last_name,
      text,
      sent: false,
    });

    // await ctx.telegram.copyMessage(groupId, chatId, messageId);
    await ctx.reply('شعر زیبای شما ارسال شد قشنگم ^^');
  }
}
