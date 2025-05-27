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
    if (!ctx.from) return;
    const userId = ctx.from.id;
    waitingForPoem.set(userId, false);
    await ctx.reply(
      'خوش اومدی. میخوای چیکار کنی؟',
      Markup.inlineKeyboard([
        Markup.button.callback('ارسال شعر', 'SEND_POEM'),
        Markup.button.callback('راهنما', 'HELP'),
      ]),
    );
  }

  @Action('SEND_POEM')
  async sendPoem(@Ctx() ctx: Context) {
    const chatType=ctx.chat?.type
    if(chatType!=='private'){
     await ctx.reply('ارسال شعر در گروه مجاز نمی باشد.')
     return 
    }
    if (!ctx.from) return;
    const userId = ctx.from.id;
    waitingForPoem.set(userId, true);
    await ctx.answerCbQuery();
    await ctx.reply('هرچه دل تنگت میخواهد بگو...');
  }

  @Action('HELP')
  async showInstructor(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await ctx.reply(
      '1. ارسال شعر در گروه مجاز نمی باشد.\n2. ویرایش و حذف شعر توسط ادمین "طاها" امکان پذیر است.\n3. پس از ارسال شعر تا تایید آن توسط ادمین منتظر بمانید.\n 4. در صورت عدم تایید شعر، شعر حذف خواهد شد.',
    );
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const message = ctx.message;

    if (!message || !('text' in message) || message.chat.type !== 'private') {
      return;
    }

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

    await ctx.reply('شعر زیبای شما ارسال شد قشنگم ^^');
  }
}
