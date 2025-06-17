import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { Context } from 'telegraf';

// Marks this class as injectable so it can be used in NestJS's dependency injection system
@Injectable()
export class BotCommandsService implements OnModuleInit {
  // Telegraf bot instance typed with Telegraf Context
  private bot: Telegraf<Context>;

  // Inject ConfigService to access environment variables
  constructor(private readonly configService: ConfigService) {}

  // This method runs when the module is initialized
  async onModuleInit() {
    // Get the bot token and group ID from environment variables
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID');

    // Ensure token and group ID are provided
    if (!token) throw new Error('توکن یافت نشد!');
    if (!groupId) throw new Error('آیدی گروه یافت نشد!');

    // Initialize the Telegraf bot with the provided token
    this.bot = new Telegraf(token);

    // 1️⃣ Clear existing global commands for the specific chat (group)
    await this.bot.telegram.setMyCommands([], {
      scope: {
        type: 'chat',
        chat_id: this.configService.get('TELEGRAM_GROUP_ID')!,
      },
    });

    // 2️⃣ Set default command for all private chat users (e.g., /start)
    await this.bot.telegram.setMyCommands(
      [{ command: 'start', description: 'گزینه‌ها' }],
      {
        scope: {
          type: 'all_private_chats',
        },
      },
    );

    // 3️⃣ Set admin-only commands for the group (only admins can use these)
    await this.bot.telegram.setMyCommands(
      [
        { command: 'poems', description: 'نمایش اشعار تایید نشده' },
        { command: 'cat', description: 'نمایش بر اساس دسته‌بندی' },
        { command: 'poet', description: 'نمایش بر اساس شاعر' },
      ],
      {
        scope: {
          type: 'chat_administrators',
          chat_id: groupId,
        },
      },
    );
  }
}
