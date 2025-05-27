// bot.module.ts
import { Module } from '@nestjs/common';
import { BotUpdate } from './bot.update';
import { Poem, PoemSchema } from './schema/bot.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { PoemSchedulerService } from './bot-scheduler.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Poem.name, schema: PoemSchema }]),
  ],
  providers: [BotUpdate,PoemSchedulerService],
})
export class BotModule {}
