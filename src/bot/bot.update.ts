import { Update, On, Ctx, Start, Action, Command } from 'nestjs-telegraf';
import { Injectable } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Poem, PoemDocument } from './schema/bot.schema';
import mongoose, { HydratedDocument, Model } from 'mongoose';
import { isAdminFn } from 'utils/isAdmin';
import { normalizePoemText } from 'utils/duplicate';
import { isValidNameOrCategory, isValidText } from 'utils/textValidation';
import { Channel, ChannelDocument } from 'src/channel/schema/channel.schema';
import { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram';
import { allCategories } from 'utils/poemCategories';

const sendPoemState = new Map<
  number,
  {
    step?: 'waiting_poem' | 'waiting_poet';
    poem?: string;
    poet?: string;
    poemId?: string;
    onEdit?: boolean;
  }
>();

const categories = [
  [
    { text: '💘 عاشقانه', callback_data: 'category_عاشقانه' },
    { text: '💔 غمگین', callback_data: 'category_غمگین' },
  ],
  [
    { text: '😄 طنز', callback_data: 'category_طنز' },
    { text: '🕊️ عرفانی', callback_data: 'category_عرفانی' },
  ],
  [
    { text: '🧠 فلسفی', callback_data: 'category_فلسفی' },
    { text: '🇮🇷 حماسی', callback_data: 'category_حماسی' },
  ],
  [
    { text: '📖 مذهبی', callback_data: 'category_مذهبی' },
    { text: '🌿 طبیعت', callback_data: 'category_طبیعت' },
  ],
  [
    { text: '💭 اجتماعی', callback_data: 'category_اجتماعی' },
    { text: '🧸 کودکانه', callback_data: 'category_کودکانه' },
  ],
  [
    { text: '🎭 انتقادی', callback_data: 'category_انتقادی' },
    { text: '🎉 مناسبتی', callback_data: 'category_مناسبتی' },
  ],
];

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
    // Get the user ID from the message sender (if available)
    const userId = ctx.from?.id;

    // If we have a user ID, clear any existing poem-sending state for this user
    if (userId) sendPoemState.delete(userId);

    // Send a welcome message with inline keyboard buttons for main menu options
    await ctx.reply(
      'سلام خوش اومدی❤️\nمرسی که غزل رو انتخاب کردی ☺️\nرو یکی از گزینه ها کلیک کن 👇',
      Markup.inlineKeyboard([
        [
          // First row of buttons: Send Poem and Help
          Markup.button.callback('ارسال شعر', 'SEND_POEM'),
          Markup.button.callback('راهنما', 'HELP'),
        ],
        [
          // Second row of buttons: Add Bot to Channel and My Channels
          Markup.button.callback('افزودن به کانال', 'ADD_BOT_TO_CHANNEL'),
          Markup.button.callback('کانال های من', `MY_CHANNELS`),
        ],
      ]),
    );
  }

  // start menu section

  @Action('SEND_POEM')
  async sendPoem(@Ctx() ctx: Context) {
    // Get the type of chat (private, group, etc.)
    const chatType = ctx.chat?.type;

    // If the chat is not private, disallow sending poems
    if (chatType !== 'private') {
      await ctx.reply('ارسال شعر در گروه مجاز نمی باشد❌');
      return;
    }

    // If the message sender info is missing, stop
    if (!ctx.from) return;
    const userId = ctx.from.id;

    const now = Date.now();

    // 1. Check if user is currently banned from sending poems
    const banExpiry = userBanMap.get(userId);
    if (banExpiry && banExpiry > now) {
      // Calculate remaining ban time in minutes
      const remaining = Math.ceil((banExpiry - now) / 60000);
      // Notify the user of their ban duration
      await ctx.reply(
        `🚫 به دلیل ارسال زیاد، به مدت ${remaining} دقیقه مسدود شدید.`,
      );
      return;
    } else if (banExpiry && banExpiry <= now) {
      // Ban expired: remove ban record for the user
      userBanMap.delete(userId);
    }

    // Set the user's state to waiting for poem input
    sendPoemState.set(userId, { step: 'waiting_poem' });

    // Acknowledge the callback query (to remove loading state on button)
    await ctx.answerCbQuery();

    // Prompt the user with instructions on how to send the poem correctly
    await ctx.reply(
      'هرچه دل تنگت میخواهد بگو...\n\n🩶 شعر فقط باید شامل حروف فارسی، فاصله، نقطه و یک یا دو بیت باشد، مانند:\n\n دارم امید عاطفتی از جناب دوست،\nکردم جنایتی و امیدم به عفو اوست\n\nیا\n\n دارم امید عاطفتی از جناب دوست،\nکردم جنایتی و امیدم به عفو اوست،\nدانم که بگذرد ز سر جرم من که او،\nگر چه پریوش است ولیکن فرشته خوست',
    );
  }

  @Action('HELP')
  async showInstructor(@Ctx() ctx: Context) {
    // Acknowledge the callback query
    await ctx.answerCbQuery();

    // Send a detailed help message with instructions about using the bot
    await ctx.reply(
      '📜 راهنمای استفاده از ربات غزل:\n\n' +
        '🔹 1. ارسال شعر:\n' +
        '   - ارسال شعر فقط از طریق ربات امکان‌پذیر است و در گروه‌ها مجاز نمی‌باشد.\n' +
        '   - شعر ارسال‌شده پس از بررسی توسط ادمین منتشر خواهد شد.\n' +
        '   - فقط ادمین امکان ویرایش یا حذف اشعار را دارد.\n' +
        '   - در صورت عدم تأیید، شعر به‌صورت خودکار حذف خواهد شد.\n\n' +
        '🔹 2. افزودن ربات به کانال:\n' +
        '   - شما می‌توانید ربات را به کانال خود اضافه کنید تا شعرها به‌صورت زمان‌بندی‌شده ارسال شوند.\n' +
        '   - پس از افزودن، باید دسته‌بندی اشعار و ساعت ارسال مورد نظر را انتخاب کنید.\n' +
        '   - فقط شعرهای تأییدشده برای کانال شما ارسال خواهند شد.\n\n' +
        '🔹 3. منوی ربات:\n' +
        '   - ✍️ ارسال شعر\n' +
        '   - 📣 افزودن ربات به کانال\n' +
        '   - 📋 مشاهده کانال‌های شما\n' +
        '   - ❓ راهنما و قوانین\n\n' +
        '✅ با استفاده از ربات غزل، به گسترش شعر و ادب فارسی کمک کنید.\n' +
        'با سپاس از همراهی شما 🌺',
    );
  }

  @Action('ADD_BOT_TO_CHANNEL')
  async handleAddBotToChannel(@Ctx() ctx: Context) {
    // Get the bot's username to create an add-to-channel link
    const botUsername = ctx.botInfo.username;

    // Acknowledge the callback query
    await ctx.answerCbQuery();

    // Reply with instructions and an inline button to add the bot to a channel
    await ctx.reply(
      `برای افزودن ربات به کانال خود، روی دکمه زیر بزنید و مطمئن شوید که ربات را به عنوان ادمین اضافه می‌کنید.  
(در بخش "Manage Messages" گزینه "Post Messages" را برای ربات فعال کنید. )
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
    // Get current chat ID to find associated channels
    const chatId = ctx.chat?.id;

    // Fetch channels where this user is the admin
    const channels = await this.channelModel
      .find({ channelAdminId: chatId })
      .exec();

    if (channels.length > 0) {
      // Prepare buttons for each channel to allow management
      const channelBtns: InlineKeyboardButton[] = [];
      channels.forEach((channel) => {
        channelBtns.push(
          Markup.button.callback(
            channel.title,
            `CHANNEL_${channel.channelId}title${channel.title}`,
          ),
        );
      });

      // Reply with list of channels and options to change settings
      await ctx.reply(
        'یکی از کانال ها رو برای تغییر ساعت ارسال شعر یا تغییر دسته بندی انتخاب کن:',
        Markup.inlineKeyboard(channelBtns),
      );
    } else {
      // No channels found for this user
      await ctx.reply('هنوز ربات رو به کانالی اضافه نکردی 😔');
    }
  }

  // end menu section

  // Handle callback actions starting with "CHANNEL_" for managing a specific channel
  @Action(/CHANNEL_.+/)
  async myChannelAction(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    // Extract channel ID and title from callback data, e.g. "CHANNEL_<id>title<title>"
    const channelInfo = ctx.match[0].replace('CHANNEL_', '').split('title');
    const channelId = channelInfo[0];
    const title = channelInfo[1];

    // Reply with a message and inline button to proceed to bot settings for the channel
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

  // Listen for chat member status updates (like bot being added or removed from channels)
  @On('my_chat_member')
  async onBotAddedToChannel(@Ctx() ctx: Context) {
    const update = ctx.update as any;

    // Extract chat info and new bot status
    const chat = update.my_chat_member?.chat;
    const newStatus = update.my_chat_member?.new_chat_member?.status;
    const channelId = chat?.id.toString();
    const userId = update.my_chat_member.from.id;

    // Check if this channel is already recorded in DB
    const existingChannel = await this.channelModel.findOne({ channelId });

    if (existingChannel && !['left', 'kicked'].includes(newStatus)) {
      // Bot still part of the channel, no action needed
      return;
    } else if (existingChannel && ['left', 'kicked'].includes(newStatus)) {
      // Bot removed or kicked from the channel
      // Remove channel record from DB
      await this.channelModel.deleteOne({ channelId });

      // Find all poems linked to this channel and remove this channel from their lists
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

    // If bot was added as an administrator to a channel, send a confirmation message
    if (chat?.type === 'channel' && newStatus === 'administrator') {
      const title = chat.title || 'Unknown';

      await ctx.telegram.sendMessage(
        userId,
        '✅ ربات با موفقیت به کانال اضافه شد.\n\nتنظیم ساعت ارسال اشعار و دسته بندی:',
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

  // Handle callback actions starting with "BOT_SETTINGS_" to configure a channel
  @Action(/BOT_SETTINGS_.+/)
  async botSettings(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    // Extract channel ID and title from callback data
    const channelInfo = ctx.match[0]
      .replace('BOT_SETTINGS_', '')
      .split('title');
    const channelId = channelInfo[0];
    const title = channelInfo[1];
    const userId = ctx.chat?.id!; // The user who clicked the button

    try {
      // Prompt user to select a time range for scheduled poem posting
      await ctx.telegram.sendMessage(
        userId,
        '\n\n⌛ لطفاً بازه زمانی ارسال شعر را انتخاب کنید:',
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

      // Upsert channel info in database: update if exists, insert otherwise
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
      // Log errors if message sending or DB update fails
      console.error('❌ Error sending welcome message to channel:', err);
    }
  }

  // Handle time range selection callbacks starting with "time_"
  @Action(/time_.+/)
  async handleTimeSelection(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    // Extract selected time range and channel ID from callback data,
    // e.g. "time_9_18_<channelId>"
    const timeRange = ctx.match[0]
      .replace('time_', '')
      .split('_')
      .slice(0, -1) // Remove channelId from the end
      .join('_');
    const channelId = ctx.match[0].replace('time_', '').split('_').at(-1);

    // Update the channel document with the selected time range
    await this.channelModel.updateOne(
      {
        channelId,
      },
      { $set: { timeRange } }, // Update only timeRange field
    );

    // Edit the message to confirm selection and prompt category selection
    await ctx.editMessageText(
      '✅ بازه زمانی ثبت شد.\n\n📂 حالا دسته‌بندی شعرها را انتخاب کن:',
      {
        reply_markup: {
          // Assuming allCategories generates buttons for poem categories
          inline_keyboard: allCategories(Number(channelId), 'CHANNEL'),
        },
      },
    );
  }

  // Handle approving a poem by admins
  @Action(/approve_(.+)/)
  async approvePoem(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    // Extract poem ID from callback data (regex capture group)
    const poemId = ctx.match[1]; // MongoDB document ID
    const chatId = this.config.get('TELEGRAM_GROUP_ID');

    // If no poem ID found, notify user and stop
    if (!poemId) {
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }

    // Check if the user is an admin in the group
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      // Only admins can approve
      await ctx.answerCbQuery('فقط ادمین اجازه تایید دارد ❌', {
        show_alert: true,
      });
      return;
    }

    // Fetch poem from DB by ID
    const poem = await this.poemModel.findById(poemId);
    if (!poem) {
      // Poem not found
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }

    // Mark poem as approved in DB
    await this.poemModel.findByIdAndUpdate(poemId, { approved: true });

    // Confirm to the user (admin) that poem is approved
    await ctx.answerCbQuery('✅ شعر تایید شد');

    // Remove inline buttons from the approval message
    await ctx.editMessageReplyMarkup(undefined);

    // Notify the poem author about approval
    await ctx.telegram.sendMessage(poem.userId, 'شعر خوشگلت تایید شد 😍');
  }

  // Handle choosing which part of a poem to edit (by admins)
  @Action(/edit_(.+)/)
  async chooseEditOption(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const poemId = ctx.match[1];
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const userId = ctx.from?.id;

    if (!poemId || !userId) {
      // Invalid data, notify user
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }

    // Verify admin permission
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.answerCbQuery('فقط ادمین اجازه تایید دارد ❌', {
        show_alert: true,
      });
      return;
    }

    // Ask admin which part they want to edit with inline buttons
    await ctx.reply('✏️ کدوم مورد رو میخوای ویرایش کنی؟', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📜 شعر', callback_data: `poem_${poemId}` },
            { text: '🙍🏼‍♂️ شاعر', callback_data: `poet_${poemId}` },
            { text: '📂 دسته بندی', callback_data: `category_${poemId}` },
          ],
        ],
      },
    });

    // Acknowledge callback query to remove loading state
    await ctx.answerCbQuery();
  }

  // Handle editing sub-options: poem text, poet name, or category
  @Action(/(poem|poet|category)_(.+)/)
  async handleEditSubOption(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const type = ctx.match[1]; // 'poem', 'poet', or 'category'
    const poemId = ctx.match[2];
    const userId = ctx.from?.id!;

    switch (type) {
      case 'poem':
        // Set state to wait for edited poem text from user
        sendPoemState.set(userId, {
          step: 'waiting_poem',
          poemId,
          onEdit: true,
        });
        await ctx.reply('شعر ویرایش شده رو بنویس: 📜');
        break;

      case 'poet':
        // Set state to wait for edited poet name from user
        sendPoemState.set(userId, {
          step: 'waiting_poet',
          poemId,
          onEdit: true,
        });
        await ctx.reply('نام شاعر:');
        break;

      case 'category':
        // Set state for editing category and show category options
        sendPoemState.set(userId, {
          onEdit: true,
        });
        await ctx.editMessageText('دسته بندی جدید رو انتخاب کن 📂:', {
          reply_markup: {
            inline_keyboard: allCategories(poemId, 'PRIVATE'),
          },
        });
        break;
    }

    // Acknowledge callback query
    await ctx.answerCbQuery();
  }

  // Handle deleting a poem (admin only)
  @Action(/delete_(.+)/)
  async deletePoem(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    const poemId = ctx.match[1];
    const chatId = this.config.get('TELEGRAM_GROUP_ID');

    if (!poemId) {
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }

    // Check admin permissions
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.answerCbQuery('فقط ادمین اجازه حذف شعر را دارد ❌', {
        show_alert: true,
      });
      return;
    }

    // Attempt to delete the poem document by ID
    const poemToDel = await this.poemModel.findByIdAndDelete(poemId);
    if (!poemToDel) {
      await ctx.answerCbQuery('شعر بافت نشد ❌', { show_alert: true });
      return;
    }

    // Delete the message with the poem (if applicable)
    await ctx.deleteMessage();

    // Confirm deletion to admin
    await ctx.answerCbQuery('🗑 شعر حذف شد');

    // Notify the poem author that their poem was rejected
    await ctx.telegram.sendMessage(
      poemToDel.userId,
      'شعرت تایید نشد 😔\nاصلاحش کن و دوباره برامون بفرست ☺️',
    );
  }

  // Show a paginated list of unapproved poems, optionally filtered by category or poet
  async showPoemsPage(
    ctx: Context,
    page: number,
    category?: string,
    poet?: string,
  ) {
    const limit = 5; // Number of poems per page

    // Build query filters: category if provided, else poet if provided
    const query: any = {};
    if (category) {
      query.category = category;
    } else if (poet) {
      query.poet = poet;
    }

    // Fetch poems from DB that match filters and are not approved yet
    // Sort by newest (createdAt descending)
    // Skip previous pages (page * limit), limit results to 'limit'
    const poems = await this.poemModel
      .find({ ...query, approved: false })
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit);

    // If no poems found, inform user
    if (!poems.length) {
      if (ctx.updateType === 'callback_query') {
        // If this is a callback query, answer the callback with a message
        await ctx.answerCbQuery('هیچ شعری برای نمایش وجود ندارد ❗️');
      } else {
        // Otherwise, send a normal message reply
        await ctx.reply('هیچ شعری برای نمایش وجود ندارد ❗️');
      }
      return;
    }

    // Format the poem list into a single message string
    // Each poem shows its number, text, poet (or 'نامشخص'), category (or 'نامشخص')
    const messageText = poems
      .map(
        (p, i) =>
          `📄 ${page * limit + i + 1}:\n${p.text}\n\n— شاعر: ${p.poet || 'نامشخص'}\n— دسته بندی: ${p.category || 'نامشخص'}\n`,
      )
      .join('\n———\n');

    // Build inline keyboard for pagination buttons: previous and next if applicable
    const keyboard = [
      [
        // Show "قبلی" button only if not on first page
        ...(page > 0
          ? [
              Markup.button.callback(
                '⬅ قبلی',
                `poems_page_${page - 1}_${category || ''}_${poet || ''}`,
              ),
            ]
          : []),
        // Show "بعدی" button only if we received a full page of results (possibly more pages)
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

    // If this request came from a callback query, try to edit the existing message with new content
    if (ctx.updateType === 'callback_query') {
      try {
        await ctx.editMessageText(messageText, {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });
      } catch (e) {
        // If editing fails (message deleted or expired), send a new message instead
        await ctx.reply(messageText, {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });
      }
    } else {
      // Otherwise, just send a new reply message with the poem list and pagination
      await ctx.reply(messageText, {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    }
  }

  // Handle pagination callback actions matching pattern 'poems_page_<page>_<category>_<poet>'
  @Action(/poems_page_(\d+)_(.*)_(.*)/)
  async paginatePoems(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    // Extract pagination parameters from callback data
    const page = parseInt(ctx.match[1]);
    const category = ctx.match[2] || undefined;
    const poet = ctx.match[3] || undefined;

    // Check if user is admin to allow viewing poems
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      // Deny access to non-admins
      await ctx.answerCbQuery('⛔ فقط ادمین‌ها اجازه مشاهده دارند.');
      return;
    }
    // Acknowledge the callback query to remove loading state
    await ctx.answerCbQuery();
    // Show the requested page with the extracted filters
    await this.showPoemsPage(ctx, page, category, poet);
  }

  // Handle '/poems' command - show first page of all unapproved poems
  @Command('poems')
  async handlePoemsCommand(@Ctx() ctx: Context) {
    // Admin check
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.reply('⛔ فقط ادمین‌ها اجازه مشاهده دارند.');
      return;
    }

    // Show first page without any filter
    await this.showPoemsPage(ctx, 0);
  }

  // Handle '/cat <category>' command - show first page of poems filtered by category
  @Command('cat')
  async showByCategory(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    // Admin check
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.reply('⛔ فقط ادمین‌ها اجازه مشاهده دارند.');
      return;
    }

    // Parse category argument from command text
    const [, category] = message.text.split(' ', 2);
    if (!category) {
      // If no category specified, send usage help
      await ctx.reply('❗ لطفا دسته‌بندی را مشخص کنید. مثلا:\n`/cat عاشقانه`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    // Show poems filtered by the given category
    await this.showPoemsPage(ctx, 0, category, undefined);
  }

  // Filter poems by poet name
  @Command('poet')
  async showByPoet(@Ctx() ctx: Context) {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    // Check if the user is admin
    const chatId = this.config.get('TELEGRAM_GROUP_ID');
    const isAdmin = await isAdminFn(ctx, chatId);
    if (!isAdmin) {
      await ctx.reply('⛔ فقط ادمین‌ها اجازه مشاهده دارند.');
      return;
    }

    // Parse the poet name from command text
    const [, poet] = message.text.split(' ', 2);
    if (!poet) {
      // Notify if no poet name was provided
      await ctx.reply('❗ لطفا نام شاعر را مشخص کنید. مثلا:\n`/poet سعدی`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    // Show poems for the specified poet
    await this.showPoemsPage(ctx, 0, undefined, poet);
  }

  // Handles poem submission or editing steps
  @On('text')
  async onText(@Ctx() ctx: Context) {
    const message = ctx.message;
    const chatType = message?.chat.type;

    if (!message || !('text' in message)) return;

    const { id: userId, username, first_name, last_name } = message.from;
    const state = sendPoemState.get(userId);
    const { text } = message;

    // If user has no active state and is in private chat, guide them to click "Send Poem"
    if (!state) {
      if (chatType === 'private') {
        await ctx.reply('ابتدا روی دکمه ارسال شعر کلیک کن 🩶');
      }
      return;
    }

    // Step 1: Waiting for the actual poem text
    if (state.step === 'waiting_poem') {
      // Validate poem format (2 lines, Persian chars, etc.)
      if (!isValidText(text)) {
        await ctx.reply(
          '🩶 شعر فقط باید شامل حروف فارسی، فاصله، نقطه و یک یا دو بیت باشد، مانند:\n\n دارم امید عاطفتی از جناب دوست،\nکردم جنایتی و امیدم به عفو اوست\n\nیا\n\n دارم امید عاطفتی از جناب دوست،\nکردم جنایتی و امیدم به عفو اوست،\nدانم که بگذرد ز سر جرم من که او،\nگر چه پریوش است ولیکن فرشته خوست',
        );
        return;
      }

      // Check for duplicates (after normalization)
      const normalizedText = normalizePoemText(text);
      const poems = await this.poemModel.find({}).select('text').lean();
      const isDuplicate = poems.some(
        (p) => normalizePoemText(p.text) === normalizedText,
      );
      if (isDuplicate && chatType === 'private') {
        await ctx.reply('این شعر قبلاً ثبت شده است. یکی دیگه بنویس 🩶');
        return;
      }

      // Move to next step: waiting for poet name
      sendPoemState.set(userId, { ...state, step: 'waiting_poet', poem: text });

      if (!state.onEdit) {
        await ctx.reply('شاعرش کیه؟');
        return;
      }
    }

    // Step 2: Waiting for poet name
    else if (state.step === 'waiting_poet') {
      if (!isValidNameOrCategory(text)) {
        await ctx.reply('نام شاعر فقط باید شامل حروف فارسی و فاصله باشد ❗️');
        return;
      }
      // Save poet name
      sendPoemState.set(userId, {
        ...state,
        poet: text,
      });
    }

    const dataPlaceHolder = sendPoemState.get(userId);
    const poet = dataPlaceHolder?.poet;
    const poem = dataPlaceHolder?.poem;
    const prevPoem = dataPlaceHolder?.poemId;

    // If it's a new poem (not edit)
    if (!prevPoem && chatType === 'private') {
      const now = Date.now();

      // Check for spam (too many poems in a short time)
      const timestamps = userPoemTimestamps.get(userId) || [];
      const filtered = timestamps.filter((ts) => now - ts < TIME_WINDOW);
      filtered.push(now);
      userPoemTimestamps.set(userId, filtered);

      if (filtered.length >= MAX_POEMS) {
        userBanMap.set(userId, now + BAN_DURATION); // Temp ban
        userPoemTimestamps.delete(userId); // Clear log
        sendPoemState.delete(userId);
      }

      // Save new poem to DB
      const newPoem: HydratedDocument<Poem> = await this.poemModel.create({
        userId,
        username,
        firstName: first_name,
        lastName: last_name,
        category: null,
        text: poem,
        poet,
        isPublished: false,
        approved: false,
      });

      // Ask for category selection
      await ctx.reply('موضوع شعر را انتخاب کن 📝', {
        reply_markup: {
          inline_keyboard: allCategories(String(newPoem._id), 'PRIVATE'),
        },
      });
    } else {
      // This is an edit to an existing poem
      const updateData: any = {};
      if (poem) updateData.text = poem;
      if (poet) updateData.poet = poet;

      const existingPoem = await this.poemModel.findByIdAndUpdate(
        prevPoem,
        updateData,
        { new: true },
      );

      if (!existingPoem) {
        await ctx.reply('شعر بافت نشد ❌');
        sendPoemState.delete(userId);
        return;
      }

      const poemId = existingPoem._id?.toString();

      // Confirm update and show edited poem
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

      sendPoemState.delete(userId);
    }
  }

  // Handles category selection (for either a poem or a channel)
  @Action(/cat_.+/)
  async handleCategorySelection(
    @Ctx() ctx: Context & { match: RegExpMatchArray },
  ) {
    const [category, channelOrPoemId] = ctx.match[0]
      .replace('cat_', '')
      .split('_');

    if (category === 'همه') {
      // Set to all categories (random poem sending)
      await ctx.reply(
        '✅ همه دسته‌بندی‌ها انتخاب شد. اشعار به‌صورت تصادفی ارسال خواهند شد.',
      );
      await this.channelModel.updateOne(
        { channelId: channelOrPoemId },
        { $set: { allCategories: true, categories: [] } },
      );
    } else if (category === 'بیشتر') {
      // Prompt user to select another category
      await ctx.reply('دسته‌ی دیگری رو انتخاب کن یا "کافیه" رو بزن.');
    } else if (category === 'تمام') {
      // Finalize bot/channel setup
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply('رباتت ساخته یا به روز رسانی شد. ✅');
    } else {
      // A specific category was chosen
      await ctx.reply(`✅ دسته "${category}" انتخاب شد.`);

      let poem;
      if (mongoose.Types.ObjectId.isValid(channelOrPoemId)) {
        poem = await this.poemModel.findById(channelOrPoemId);
      }

      if (poem) {
        // Assign category to poem
        const poemId = channelOrPoemId;
        await this.poemModel.findByIdAndUpdate(poemId, { $set: { category } });

        const groupId = process.env.TELEGRAM_GROUP_ID!;
        // Notify group with updated poem
        await ctx.telegram.sendMessage(
          groupId,
          `☘️ شعر جدید:\n\n${poem.text}\n\n♦️ شاعر: ${poem.poet}\n\n♦️ دسته بندی: ${category}`,
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

        const adminId = ctx.from?.id!;
        const state = sendPoemState.get(adminId);
        if (!state?.onEdit) {
          await ctx.reply('شعر زیبای شما ارسال شد 💚');
          sendPoemState.delete(poem.userId);
        }

        sendPoemState.delete(adminId);
      } else {
        // Assign category to a channel (if not a poem submission)
        await this.channelModel.updateOne(
          {
            channelId: channelOrPoemId,
          },
          {
            $addToSet: { categories: category },
            $set: { allCategories: false },
          },
        );
      }
    }
  }
}
