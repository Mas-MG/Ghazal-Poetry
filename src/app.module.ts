import { AgentConnectOpts } from './../node_modules/agent-base/dist/index.d';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotModule } from './bot/bot.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ChannelModule } from './channel/channel.module';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { PoemsModule } from './poems/poems.module';


@Module({
  imports: [
    // Load .env and make ConfigService available everywhere
    ConfigModule.forRoot({ isGlobal: true }),

    // Connect to MongoDB using MONGODB_URI from .env
    MongooseModule.forRootAsync({
      useFactory: async () => ({
        uri: process.env.MONGODB_URI,
      }),
    }),

    TelegrafModule.forRoot({
      token: process.env.TELEGRAM_BOT_TOKEN!,
    }),

    BotModule,
    ScheduleModule.forRoot(),
    ChannelModule,
    PoemsModule,
  ],
  exports: [TelegrafModule],

})
export class AppModule {}
