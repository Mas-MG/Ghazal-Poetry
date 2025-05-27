// bot.module.ts
import { Module } from '@nestjs/common';
import { BotUpdate } from './bot.update';
import { Poem, PoemSchema } from './schema/bot.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { BotCommandsService } from './command.service';
import { BotService } from './bot.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Poem.name, schema: PoemSchema }]),
  ],
  providers: [BotUpdate,BotCommandsService, BotService],
})
export class BotModule {}
