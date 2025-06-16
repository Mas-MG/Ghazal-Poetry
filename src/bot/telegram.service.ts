// telegram.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    // Set up SOCKS proxy agent
    const socksAgent = new SocksProxyAgent(
      'socks5h://localhost:1080',
    ); // adjust the proxy URL as needed

    // Provide agent to bot
    this.bot = new Telegraf(token!, {
      telegram: {
        agent: socksAgent as https.Agent,
      },
    });

    this.bot.start((ctx) => ctx.reply('Bot started via proxy!'));
    this.bot.launch();

    console.log('Telegram bot launched with proxy.');
  }
}
