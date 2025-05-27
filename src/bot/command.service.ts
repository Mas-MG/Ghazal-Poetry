import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';

@Injectable()
export class BotCommandsService implements OnModuleInit {
  private bot: Telegraf<any>;
  constructor(private readonly configService: ConfigService) {}
  onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('توکن بافت نشد!');
    this.bot = new Telegraf(token);
    this.bot.telegram.setMyCommands([
      { command: 'start', description: 'گزینه ها' },
    ]);
  }
}
