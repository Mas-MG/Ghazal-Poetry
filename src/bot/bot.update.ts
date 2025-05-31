import { Update, On, Ctx, Start, Action, Command } from 'nestjs-telegraf';
import { Injectable } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Poem } from './schema/bot.schema';
import { HydratedDocument, Model } from 'mongoose';
import { isAdminFn } from 'utils/isAdmin';
import { normalizePoemText } from 'utils/duplicate';
import { isValidNameOrCategory, isValidText } from 'utils/textValidation';

const sendPoemState = new Map<
  number,
  {
    step: 'waiting_poem' | 'waiting_poet' | 'waiting_category';
    poem?: string;
    poet?: string;
    poemId?: string;
  }
>();

// Limit for sending message to avoid spam
const userPoemTimestamps = new Map<number, number[]>(); // userId -> [timestamps]
const userBanMap = new Map<number, number>(); // userId -> banExpiryTimestamp

const MAX_POEMS = 3; // Max poems allowed
const TIME_WINDOW = 60 * 1000; // 30 seconds
const BAN_DURATION = 5 * 60 * 1000; // 5 minutes

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

    const now = Date.now();

    // 1. Check if user is banned
    const banExpiry = userBanMap.get(userId);
    if (banExpiry && banExpiry > now) {
      const remaining = Math.ceil((banExpiry - now) / 60000);
      await ctx.reply(
        `🚫 به دلیل ارسال زیاد، به مدت ${remaining} دقیقه مسدود شدید.`,
      );
      return;
    } else if (banExpiry && banExpiry > now) {
      userBanMap.delete(userId);
    }

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
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    if (!poemId) {
      await ctx.answerCbQuery('خطا: شعر بافت نشد!', { show_alert: true });
      return;
    }
    const isAdmin = await isAdminFn(ctx, chatId);
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

  @Action(/edit_(.+)/)
  async editPoem(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const poemId = ctx.match[1];
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const userId = ctx.from?.id;
    if (!poemId || !userId) {
      await ctx.answerCbQuery('خطا: شعر بافت نشد!', { show_alert: true });
      return;
    }
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.answerCbQuery('فقط ادمین اجازه تایید دارد!', {
        show_alert: true,
      });
      return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('✏ لطفا متن جدید را ارسال کنید.');
    const poem = await this.poemModel.findById(poemId);
    if (!poem) {
      await ctx.answerCbQuery('خطا: شعر پیدا نشد!', { show_alert: true });
      return;
    }
    sendPoemState.set(userId, {
      step: 'waiting_poem',
      poemId: poem?._id?.toString(),
    });
    await ctx.editMessageReplyMarkup(undefined);
  }

  @Action(/delete_(.+)/)
  async deletePoem(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const poemId = ctx.match[1];
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    if (!poemId) {
      await ctx.answerCbQuery('خطا: شعر یافت نشد.', { show_alert: true });
      return;
    }
    const isAdmin = await isAdminFn(ctx, chatId);
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

  async showPoemsPage(
    ctx: Context,
    page: number,
    category?: string,
    poet?: string,
  ) {
    const limit = 5;

    const query: any = {};
    if (category) {
      query.category = category;
    } else if (poet) {
      query.poet = poet;
    }

    const poems = await this.poemModel
      .find({ ...query, approved: false })
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit);

    if (!poems.length) {
      if (ctx.updateType === 'callback_query') {
        await ctx.answerCbQuery('هیچ شعری برای نمایش وجود ندارد.');
      } else {
        await ctx.reply('هیچ شعری برای نمایش وجود ندارد.');
      }
      return;
    }

    const messageText = poems
      .map(
        (p, i) =>
          `📄 ${page * limit + i + 1}:\n${p.text}\n— شاعر: ${p.poet || 'نامشخص'}\n— دسته بندی: ${p.category || 'نامشخص'}\n`,
      )
      .join('\n———\n');

    const keyboard = [
      [
        ...(page > 0
          ? [
              Markup.button.callback(
                '⬅ قبلی',
                `poems_page_${page - 1}_${category || ''}_${poet || ''}`,
              ),
            ]
          : []),
        ...(poems.length === limit
          ? [
              Markup.button.callback(
                'بعدی ➡',
                `poems_page_${page + 1}_${category || ''}_${poet || ''}`,
              ),
            ]
          : []),
      ],
    ];

    if (ctx.updateType === 'callback_query') {
      try {
        await ctx.editMessageText(messageText, {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });
      } catch (e) {
        // Fallback: if edit fails, send a new message
        await ctx.reply(messageText, {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });
      }
    } else {
      // New command message: just reply
      await ctx.reply(messageText, {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    }
  }

  @Action(/poems_page_(\d+)_(.*)_(.*)/)
  async paginatePoems(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const page = parseInt(ctx.match[1]);
    const category = ctx.match[2] || undefined;
    const poet = ctx.match[3] || undefined;

    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.answerCbQuery('⛔ فقط ادمین‌ها اجازه مشاهده دارند.');
      return;
    }

    await ctx.answerCbQuery();
    await this.showPoemsPage(ctx, page, category, poet);
  }

  @Command('poems')
  async handlePoemsCommand(@Ctx() ctx: Context) {
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const isAdmin = await isAdminFn(ctx, chatId); // or whatever your admin check is
    if (!isAdmin) {
      await ctx.reply('⛔ فقط ادمین‌ها اجازه مشاهده دارند.');
      return;
    }

    await this.showPoemsPage(ctx, 0); // صفحه اول
  }

  @Command('cat')
  async showByCategory(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.reply('⛔ فقط ادمین‌ها اجازه مشاهده دارند.');
      return;
    }

    const [, category] = message.text.split(' ', 2);
    if (!category) {
      await ctx.reply('❗ لطفا دسته‌بندی را مشخص کنید. مثلا:\n`/cat عاشقانه`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    await this.showPoemsPage(ctx, 0, category, undefined);
  }

  @Command('poet')
  async showByPoet(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.reply('⛔ فقط ادمین‌ها اجازه مشاهده دارند.');
      return;
    }

    const [, poet] = message.text.split(' ', 2);
    if (!poet) {
      await ctx.reply('❗ لطفا نام شاعر را مشخص کنید. مثلا:\n`/poet سعدی`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    await this.showPoemsPage(ctx, 0, undefined, poet);
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const message = ctx.message;
    const chatType = message?.chat.type;

    if (!message || !('text' in message)) {
      return;
    }

    const { id: userId, username, first_name, last_name } = message.from;
    const state = sendPoemState.get(userId);
    const { text } = message;
    if (!state) {
      if (chatType === 'private') {
        await ctx.reply('ابتدا روی دکمه ارسال شعر کلیک کن!');
        return;
      }
      return;
    }

    if (state.step === 'waiting_poem') {
      if (!isValidText(text)) {
        await ctx.reply(
          '❗ شعر فقط باید شامل حروف فارسی، فاصله، نقطه یا یک یا دو بیت باشد.',
        );
        return;
      }
      // Avoiding to save duplicate poem
      const normalizedText = normalizePoemText(text);
      const poems = await this.poemModel.find({}).select('text').lean();
      const isDuplicate = poems.some(
        (p) => normalizePoemText(p.text) === normalizedText,
      );

      if (isDuplicate) {
        await ctx.reply('❗ این شعر قبلاً ثبت شده است. دوباره دیگه بنویس');
        return;
      }
      sendPoemState.set(userId, { ...state, step: 'waiting_poet', poem: text });
      await ctx.reply('شاعرش کیه؟');
      return;
    } else if (state.step === 'waiting_poet') {
      if (!isValidNameOrCategory(text)) {
        await ctx.reply('❗ نام شاعر فقط باید شامل حروف فارسی و فاصله باشد.');
        return;
      }
      sendPoemState.set(userId, {
        ...state,
        step: 'waiting_category',
        poet: text,
      });
      await ctx.reply('موضوعش چیه؟');
      return;
    } else if (state.step === 'waiting_category') {
      if (!isValidNameOrCategory(text)) {
        await ctx.reply(
          '❗ دسته‌بندی فقط باید شامل حروف فارسی یا عربی و فاصله باشد.',
        );
        return;
      }
      const dataPlaceHolder = sendPoemState.get(userId);
      if (!dataPlaceHolder?.poem || !dataPlaceHolder?.poet) {
        await ctx.reply('لطفا شعر و شاعر را وارد کنید.');
        return;
      }
      const { poem, poet } = dataPlaceHolder;
      const groupId = this.config.get('TELEGRAM_GROUP_ID');

      const prevPoem = sendPoemState.get(userId)?.poemId;

      if (!prevPoem && chatType === 'private') {
        const now = Date.now();

        // 2. Track timestamps
        const timestamps = userPoemTimestamps.get(userId) || [];
        const filtered = timestamps.filter((ts) => now - ts < TIME_WINDOW);

        filtered.push(now);
        userPoemTimestamps.set(userId, filtered);

        // 3. Ban if exceeded
        if (filtered.length >= MAX_POEMS) {
          userBanMap.set(userId, now + BAN_DURATION);
          userPoemTimestamps.delete(userId); // Clear spam log
          sendPoemState.delete(userId);

          // await ctx.reply(
          //   `🚫 به دلیل ارسال زیاد، به مدت ${BAN_DURATION / 60000} دقیقه مسدود شدید.`,
          // );
          // return;
        }

        // Save poem
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

        const poemId = newPoem._id?.toString();
        await ctx.telegram.sendMessage(
          groupId,
          `شعر جدید:\n\n${newPoem.text}\nشاعر: ${newPoem.poet}\n دسته بندی: ${newPoem.category}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ تایید', callback_data: `approve_${poemId}` },
                  { text: '✏ ویرایش', callback_data: `edit_${poemId}` },
                  { text: '🗑 حذف', callback_data: `delete_${poemId}` },
                ],
              ],
            },
          },
        );
        await ctx.reply('شعر زیبای شما ارسال شد ^^');
      } else {
        const existingPoem = await this.poemModel.findByIdAndUpdate(
          prevPoem,
          {
            category: text,
            text: poem,
            poet,
          },
          { new: true },
        );
        if (!existingPoem || !prevPoem) {
          await ctx.reply('خطا: شعر یافت نشد!');
          sendPoemState.delete(userId);
          return;
        }

        const poemId = existingPoem._id?.toString();

        await ctx.reply('شعر ویرایش شد!');
        await ctx.reply(
          `شعر ویرایش شده:\n\n${existingPoem.text}\nشاعر: ${existingPoem.poet}\n دسته بندی: ${existingPoem.category}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ تایید', callback_data: `approve_${poemId}` },
                  { text: '✏ ویرایش', callback_data: `edit_${poemId}` },
                  { text: '🗑 حذف', callback_data: `delete_${poemId}` },
                ],
              ],
            },
          },
        );
        await ctx.telegram.sendMessage(
          existingPoem.userId,
          'شعر شما ویرایش شد!',
        );
      }
      sendPoemState.delete(userId);
    }
  }
}
