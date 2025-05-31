import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { Context } from 'telegraf';

@Injectable()
export class BotCommandsService implements OnModuleInit {
  private bot: Telegraf<Context>;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID');

    if (!token) throw new Error('توکن یافت نشد!');
    if (!groupId) throw new Error('آی‌دی گروه یافت نشد!');

    this.bot = new Telegraf(token);

    // 1. Clear global commands (default scope)
    await this.bot.telegram.setMyCommands([], {
      scope: {
        type: 'chat',
        chat_id: this.configService.get('TELEGRAM_GROUP_ID')!,
      },
    });

    // 👥 For all users (default scope)
    await this.bot.telegram.setMyCommands(
      [{ command: 'start', description: 'گزینه‌ها' }],
      {
        scope: {
          type: 'all_private_chats',
        },
      },
    );

    // 🔐 For group admins only
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
