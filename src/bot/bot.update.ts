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
import { Channel, ChannelDocument } from 'src/channel/schema/channel.schema';
import { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram';

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
    @InjectModel(Channel.name)
    private readonly channelModel: Model<ChannelDocument>,
  ) {}

  @Start()
  async startCommand(@Ctx() ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) sendPoemState.delete(ctx.from?.id);
    await ctx.reply(
      'سلام خوش اومدی❤️\nمرسی که غزل رو انتخاب کردی ☺️\nرو یکی از گزینه ها کلیک کن 👇',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('ارسال شعر', 'SEND_POEM'),
          Markup.button.callback('راهنما', 'HELP'),
        ],
        [
          Markup.button.callback('افزودن به کانال', 'ADD_BOT_TO_CHANNEL'),
          Markup.button.callback('کانال های من', `MY_CHANNELS`),
        ],
      ]),
    );
  }

  @Action('ADD_BOT_TO_CHANNEL')
  async handleAddBotToChannel(@Ctx() ctx: Context) {
    const botUsername = ctx.botInfo.username;
    await ctx.answerCbQuery();
    await ctx.reply(
      `برای افزودن ربات به کانال خود، روی دکمه زیر بزنید و مطمئن شوید که ربات را به عنوان ادمین اضافه می‌کنید.  
(در بخش "Manage Messages" گزینه "Post Messages" را برای ربات فعال کنید.)
`,
      Markup.inlineKeyboard([
        [
          Markup.button.url(
            '➕ افزودن ربات به کانال',
            `https://t.me/${botUsername}?startchannel=start`,
          ),
        ],
      ]),
    );
  }

  @Action('MY_CHANNELS')
  async myChannelsAction(@Ctx() ctx: Context) {
    const chatId = ctx.chat?.id;
    const channels = await this.channelModel
      .find({ channelAdminId: chatId })
      .exec();
    if (channels.length > 0) {
      const channelBtns: InlineKeyboardButton[] = [];
      channels.forEach((channel) => {
        channelBtns.push(
          Markup.button.callback(
            channel.title,
            `CHANNEL_${channel.channelId}title${channel.title}`,
          ),
        );
      });

      await ctx.reply(
        'یکی از کانال ها رو برای تغییر ساعت ارسال شعر یا تغییر دسته بندی انتخاب کن:',
        Markup.inlineKeyboard(channelBtns),
      );
    } else {
      await ctx.reply('هنوز ربات رو به کانالی اضافه نکردی 😔');
    }
  }

  @Action(/CHANNEL_.+/)
  async myChannelAction(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const channelInfo = ctx.match[0].replace('CHANNEL_', '').split('title');
    const channelId = channelInfo[0];
    const title = channelInfo[1];
    await ctx.reply('تنظیم ساعت ارسال اشعار و دسته بندی:', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'انجام تنظیمات',
              callback_data: `BOT_SETTINGS_${channelId}title${title}`,
            },
          ],
        ],
      },
    });
  }

  @On('my_chat_member')
  async onBotAddedToChannel(@Ctx() ctx: Context) {
    const update = ctx.update as any;
    const chat = update.my_chat_member?.chat;
    const newStatus = update.my_chat_member?.new_chat_member?.status;
    const channelId = chat?.id.toString();
    const userId = update.my_chat_member.from.id;

    const existingChannel = await this.channelModel.findOne({ channelId });

    if (existingChannel && !['left', 'kicked'].includes(newStatus)) {
      return;
    } else if (existingChannel && ['left', 'kicked'].includes(newStatus)) {
      await this.channelModel.deleteOne({ channelId });
      const poems = await this.poemModel.find().lean();
      for (const poem of poems) {
        if (poem.channels.includes(channelId)) {
          const updatedChannels = poem.channels.filter(
            (channel) => channel !== channelId,
          );

          await this.poemModel.updateOne(
            { _id: poem._id },
            { $set: { channels: updatedChannels } },
          );
        }
      }
    }

    // Only respond to being added to a channel
    if (chat?.type === 'channel' && newStatus === 'administrator') {
      const title = chat.title || 'Unknown';

      await ctx.telegram.sendMessage(
        userId,
        'تنظیم ساعت ارسال اشعار و دسته بندی:',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'انجام تنظیمات',
                  callback_data: `BOT_SETTINGS_${channelId}title${title}`,
                },
              ],
            ],
          },
        },
      );
    }
  }

  @Action(/BOT_SETTINGS_.+/)
  async botSettings(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const channelInfo = ctx.match[0]
      .replace('BOT_SETTINGS_', '')
      .split('title');
    const channelId = channelInfo[0];
    const title = channelInfo[1];
    const userId = ctx.chat?.id!;

    try {
      await ctx.telegram.sendMessage(
        userId,
        '✅ ربات با موفقیت به کانال اضافه شد.\n\n⌛ لطفاً بازه زمانی ارسال شعر را انتخاب کنید:',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🕘 9 صبح تا 6 عصر',
                  callback_data: `time_9_18_${channelId}`,
                },
              ],
              [
                {
                  text: '🕔 6 عصر تا 12 شب',
                  callback_data: `time_18_24_${channelId}`,
                },
              ],
            ],
          },
        },
      );
      await this.channelModel.updateOne(
        { channelId },
        {
          $set: {
            title,
            channelAdminId: userId,
            channelId,
          },
        },
        { upsert: true },
      );
    } catch (err) {
      console.error('❌ Error sending welcome message to channel:', err);
    }
  }

  @Action(/time_.+/)
  async handleTimeSelection(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const timeRange = ctx.match[0]
      .replace('time_', '')
      .split('_')
      .slice(0, -1)
      .join('_');
    const channelId = ctx.match[0].replace('time_', '').split('_').at(-1);

    await this.channelModel.updateOne(
      {
        channelId,
      },
      { $set: { timeRange } }, // Only update 'title'
    );

    // Save to DB: time preference per channelId
    await ctx.editMessageText(
      '✅ بازه زمانی ثبت شد.\n\n📂 حالا دسته‌بندی شعرها را انتخاب کن:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💔 عاشقانه', callback_data: `cat_عاشقانه_${channelId}` }],
            [{ text: '📜 اجتماعی', callback_data: `cat_اجتماعی_${channelId}` }],
            [{ text: '😢 غمگین', callback_data: `cat_غمگین_${channelId}` }],
            [
              {
                text: '✨ همه دسته‌بندی‌ها',
                callback_data: `cat_همه_${channelId}`,
              },
            ],
            [
              {
                text: '➕ افزودن بیشتر',
                callback_data: `cat_بیشتر_${channelId}`,
              },
            ],
            [{ text: '✅ کافیه', callback_data: `cat_تمام_${channelId}` }],
          ],
        },
      },
    );
  }

  @Action(/cat_.+/)
  async handleCategorySelection(
    @Ctx() ctx: Context & { match: RegExpMatchArray },
  ) {
    const category = ctx.match[0].replace('cat_', '').split('_').at(0);
    const channelId = ctx.match[0].replace('cat_', '').split('_').at(-1);

    if (category === 'همه') {
      // Save: All categories for this channel
      await ctx.reply(
        '✅ همه دسته‌بندی‌ها انتخاب شد. اشعار به‌صورت تصادفی ارسال خواهند شد.',
      );
      await this.channelModel.updateOne(
        { channelId },
        { $set: { allCategories: true, categories: [] } },
      );
    } else if (category === 'بیشتر') {
      await ctx.reply('دسته‌ی دیگری رو انتخاب کن یا "کافیه" رو بزن.');
    } else if (category === 'تمام') {
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply(
        'رباتت ساخته شد. حالا میتونی هر روز اشعار دلنشین توی کانالت داشته باشی 🥰',
      );
    } else {
      await ctx.reply(`✅ دسته "${category}" انتخاب شد.`);
      await this.channelModel.updateOne(
        {
          channelId,
        },
        {
          $addToSet: { categories: category },
          $set: { allCategories: false },
        },
      );
    }
  }

  @Action('SEND_POEM')
  async sendPoem(@Ctx() ctx: Context) {
    const chatType = ctx.chat?.type;
    if (chatType !== 'private') {
      await ctx.reply('ارسال شعر در گروه مجاز نمی باشد❌');
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
    await ctx.reply(
      'هرچه دل تنگت میخواهد بگو...\n\n🩶 شعر فقط باید شامل حروف فارسی، فاصله، نقطه و یک یا دو بیت باشد، مانند:\n\n♦️ دارم امید عاطفتی از جناب دوست،\nکردم جنایتی و امیدم به عفو اوست\n\nیا\n\n♦️ دارم امید عاطفتی از جناب دوست،\nکردم جنایتی و امیدم به عفو اوست،\nدانم که بگذرد ز سر جرم من که او،\nگر چه پریوش است ولیکن فرشته خوست',
    );
  }

  @Action('HELP')
  async showInstructor(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await ctx.reply(
      '1. ارسال شعر در گروه مجاز نمی باشد.\n2. ویرایش و حذف شعر توسط ادمین امکان پذیر است.\n3. پس از ارسال شعر تا تایید آن توسط ادمین منتظر بمانید.\n 4. در صورت عدم تایید شعر، شعر حذف خواهد شد.',
    );
  }

  @Action(/approve_(.+)/)
  async approvePoem(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const poemId = ctx.match[1]; //Mongo db id
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    if (!poemId) {
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.answerCbQuery('فقط ادمین اجازه تایید دارد ❌', {
        show_alert: true,
      });
      return;
    }
    const poem = await this.poemModel.findById(poemId);
    if (!poem) {
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }
    await this.poemModel.findByIdAndUpdate(poemId, { approved: true });

    await ctx.answerCbQuery('✅ شعر تایید شد');
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.telegram.sendMessage(poem.userId, 'شعر خوشگلت تایید شد 😍');
  }

  @Action(/edit_(.+)/)
  async editPoem(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const poemId = ctx.match[1];
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const userId = ctx.from?.id;
    if (!poemId || !userId) {
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.answerCbQuery('فقط ادمین اجازه تایید دارد ❌', {
        show_alert: true,
      });
      return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('✏️ لطفا متن جدید را ارسال کنید.');
    const poem = await this.poemModel.findById(poemId);
    if (!poem) {
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
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
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.answerCbQuery('فقط ادمین اجازه حذف شعر را دارد ❌', {
        show_alert: true,
      });
      return;
    }
    const poemToDel = await this.poemModel.findByIdAndDelete(poemId);
    if (!poemToDel) {
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }
    await ctx.deleteMessage();
    await ctx.answerCbQuery('🗑 شعر حذف شد');
    await ctx.telegram.sendMessage(
      poemToDel.userId,
      'شعرت تایید نشد 😔\nاصلاحش کن و دوباره برامون بفرست ☺️',
    );
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
        await ctx.answerCbQuery('هیچ شعری برای نمایش وجود ندارد ❗️');
      } else {
        await ctx.reply('هیچ شعری برای نمایش وجود ندارد ❗️');
      }
      return;
    }

    const messageText = poems
      .map(
        (p, i) =>
          `📄 ${page * limit + i + 1}:\n${p.text}\n\n— شاعر: ${p.poet || 'نامشخص'}\n— دسته بندی: ${p.category || 'نامشخص'}\n`,
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
        await ctx.reply('ابتدا روی دکمه ارسال شعر کلیک کن 🩶');
        return;
      }
      return;
    }

    if (state.step === 'waiting_poem') {
      if (!isValidText(text)) {
        await ctx.reply(
          '🩶 شعر فقط باید شامل حروف فارسی، فاصله، نقطه و یک یا دو بیت باشد، مانند:\n\n دارم امید عاطفتی از جناب دوست،\nکردم جنایتی و امیدم به عفو اوست\n\nیا\n\n دارم امید عاطفتی از جناب دوست،\nکردم جنایتی و امیدم به عفو اوست،\nدانم که بگذرد ز سر جرم من که او،\nگر چه پریوش است ولیکن فرشته خوست',
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
        await ctx.reply('این شعر قبلاً ثبت شده است. یکی دیگه بنویس 🩶');
        return;
      }
      sendPoemState.set(userId, { ...state, step: 'waiting_poet', poem: text });
      await ctx.reply('شاعرش کیه؟');
      return;
    } else if (state.step === 'waiting_poet') {
      if (!isValidNameOrCategory(text)) {
        await ctx.reply('نام شاعر فقط باید شامل حروف فارسی و فاصله باشد ❗️');
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
        await ctx.reply('دسته‌بندی فقط باید شامل حروف فارسی و فاصله باشد ❗️');
        return;
      }
      const dataPlaceHolder = sendPoemState.get(userId);
      if (!dataPlaceHolder?.poem || !dataPlaceHolder?.poet) {
        await ctx.reply('لطفا شعر و شاعر را وارد کنید ❗️');
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
          `☘️ شعر جدید:\n\n${newPoem.text}\n\n♦️ شاعر: ${newPoem.poet}\n\n♦️ دسته بندی: ${newPoem.category}`,
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
        await ctx.reply('شعر زیبای شما ارسال شد 💚');
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
          await ctx.reply('شعر بافت نشد ❌');
          sendPoemState.delete(userId);
          return;
        }

        const poemId = existingPoem._id?.toString();

        await ctx.reply('شعر ویرایش شد ✅');
        await ctx.reply(
          `☘️ شعر جدید:\n\n${existingPoem.text}\n\n♦️ شاعر: ${existingPoem.poet}\n\n♦️ دسته بندی: ${existingPoem.category}`,
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
          'شعر شما ویرایش شد ☘️',
        );
      }
      sendPoemState.delete(userId);
    }
  }
}
