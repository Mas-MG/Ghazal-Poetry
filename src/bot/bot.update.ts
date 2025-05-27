import { Update, On, Ctx } from 'nestjs-telegraf';
import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Poem } from './schema/bot.schema';
import { Model } from 'mongoose';

@Update()
@Injectable()
export class BotUpdate {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(Poem.name) private readonly poemModel: Model<Poem>,
  ) {}

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

    const chatId = message.chat.id;
    const messageId = message.message_id;

    const { id: userId, username, first_name, last_name } = message.from;
    const { text } = message;

    await this.poemModel.create({
      userId,
      username,
      firstName: first_name,
      lastName: last_name,
      text,
      sent:false
    });
    

    // await ctx.telegram.copyMessage(groupId, chatId, messageId);
    await ctx.reply('شعر زیبای شما ارسال شد قشنگم ^^');
  }
}
