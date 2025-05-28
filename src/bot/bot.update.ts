import { Update, On, Ctx, Start, Action } from 'nestjs-telegraf';
import { Injectable } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Poem } from './schema/bot.schema';
import { HydratedDocument, Model } from 'mongoose';

const sendPoemState = new Map<
  number,
  {
    step: 'waiting_poem' | 'waiting_poet' | 'waiting_category';
    poem?: string;
    poet?: string;
  }
>();

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
      'خوش اومدی. میخوای چیکار کنی؟',
      Markup.inlineKeyboard([
        Markup.button.callback('ارسال شعر', 'SEND_POEM'),
        Markup.button.callback('راهنما', 'HELP'),
      ]),
    );
  }

  @Action('SEND_POEM')
  async sendPoem(@Ctx() ctx: Context) {
    const chatType = ctx.chat?.type;
    if (chatType !== 'private') {
      await ctx.reply('ارسال شعر در گروه مجاز نمی باشد.');
      return;
    }
    if (!ctx.from) return;
    const userId = ctx.from.id;
    sendPoemState.set(userId, { step: 'waiting_poem' });
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

  @Action(/approve_(.+)/)
  async approvePoem(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const poemId = ctx.match[1]; //Mongo db id
    const chatId = ctx.chat?.id;
    if (!chatId || !poemId) {
      await ctx.answerCbQuery('خطا: بافت نشد!', { show_alert: true });
      return;
    }
    const admins = await ctx.telegram.getChatAdministrators(chatId);
    const isAdmin = admins.some((admin) => admin.user.id === ctx.from?.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('فقط ادمین اجازه تایید دارد!', {
        show_alert: true,
      });
      return;
    }
    const poem = await this.poemModel.findById(poemId);
    if (!poem) {
      await ctx.answerCbQuery('خطا: شعر پیدا نشد!', { show_alert: true });
      return;
    }
    await this.poemModel.findByIdAndUpdate(poemId, { approved: true });

    await ctx.answerCbQuery('✅ شعر تایید شد');
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.telegram.sendMessage(poem.userId, 'شعر خوشگلت تایید شد :)');
  }

  @Action(/delete_(.+)/)
  async deletePoem(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const poemId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (!poemId || !chatId) {
      await ctx.answerCbQuery('خطا: یافت نشد.', { show_alert: true });
      return;
    }
    const admins = await ctx.telegram.getChatAdministrators(chatId);
    const isAdmin = await admins.some(
      (admin) => admin.user.id === ctx.from?.id,
    );
    if (!isAdmin) {
      await ctx.answerCbQuery('فقط ادمین اجازه حذف شعر را دارد!', {
        show_alert: true,
      });
      return;
    }
    const poemToDel = await this.poemModel.findByIdAndDelete(poemId);
    if (!poemToDel) {
      await ctx.answerCbQuery('شعر یافت نشد!', { show_alert: true });
      return;
    }
    await ctx.deleteMessage();
    await ctx.answerCbQuery('🗑 شعر حذف شد');
    await ctx.telegram.sendMessage(poemToDel.userId, 'شعر شما تایید نشد!');
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const message = ctx.message;

    if (!message || !('text' in message) || message.chat.type !== 'private') {
      return;
    }

    const { id: userId, username, first_name, last_name } = message.from;
    const { text } = message;
    const state = sendPoemState.get(userId);
    if (!state) {
      await ctx.reply('ابتدا روی دکمه ارسال شعر کلیک کن!');
      return;
    }

    if (state.step === 'waiting_poem') {
      sendPoemState.set(userId, { step: 'waiting_poet', poem: text });
      await ctx.reply('شاعرش کیه؟');
      return;
    } else if (state.step === 'waiting_poet') {
      sendPoemState.set(userId, {
        ...state,
        step: 'waiting_category',
        poet: text,
      });
      await ctx.reply('موضوعش چیه؟');
      return;
    } else if (state.step === 'waiting_category') {
      const dataPlaceHolder = sendPoemState.get(userId);
      if (!dataPlaceHolder?.poem || !dataPlaceHolder?.poet) {
        await ctx.reply('لطفا شعر و شاعر را وارد کنید.');
        return;
      }
      const { poem, poet } = dataPlaceHolder;

      const newPoem: HydratedDocument<Poem> = await this.poemModel.create({
        userId,
        username,
        firstName: first_name,
        lastName: last_name,
        category: text,
        text: poem,
        poet,
        isPublished: false,
        approved: false,
      });
      sendPoemState.delete(userId);
      const groupId = this.config.get('TELEGRAM_GROUP_ID');
      const poemId = newPoem._id?.toString();
      await ctx.telegram.sendMessage(
        groupId,
        `شعر جدید:\n\n${newPoem.text}\nشاعر: ${newPoem.poet}\n دسته بندی: ${newPoem.category}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ تایید', callback_data: `approve_${poemId}` }],
              [{ text: '✏ ویرایش', callback_data: `edit_${poemId}` }],
              [{ text: '🗑 حذف', callback_data: `delete_${poemId}` }],
            ],
          },
        },
      );
      await ctx.reply('شعر زیبای شما ارسال شد ^^');
    }
  }
}
