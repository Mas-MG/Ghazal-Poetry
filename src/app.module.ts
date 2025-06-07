import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotModule } from './bot/bot.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ChannelModule } from './channel/channel.module';

@Module({
  imports: [
    // Load .env and make ConfigService available everywhere
    ConfigModule.forRoot({ isGlobal: true }),

    // Connect to MongoDB using MONGODB_URI from .env
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (cs: ConfigService) => ({
        uri: cs.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (cs: ConfigService) => {
        const token = cs.get<string>('TELEGRAM_BOT_TOKEN');
        if (!token) {
          throw new Error(
            'توکن یافت نشد!'
          );
        }

        return {
          token,
        };
      },
      inject: [ConfigService],
    }),
    BotModule,
    ScheduleModule.forRoot(),
    ChannelModule,
  ],
  exports: [TelegrafModule],
})
export class AppModule {}
