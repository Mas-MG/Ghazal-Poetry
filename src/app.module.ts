import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotModule } from './bot/bot.module';
import { ScheduleModule } from '@nestjs/schedule';

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

    // Configure the Telegram bot with the token from .env
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (cs: ConfigService) => {
        const token = cs.get<string>('TELEGRAM_BOT_TOKEN');
        if (!token) {
          throw new Error(
            'TELEGRAM_BOT_TOKEN is not defined in environment variables',
          );
        }

        return {
          token,
        };
      },
      inject: [ConfigService],
    }),

    // Our BotModule (contains the update handler)
    BotModule,
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
