import { Module } from '@nestjs/common';
import { BotUpdate } from './bot.update';
import { Poem, PoemSchema } from './schema/bot.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { BotCommandsService } from './command.service';
import { PoemSchedulerService } from './bot.service';
import { TelegrafModule } from 'nestjs-telegraf';
import { Channel, ChannelSchema } from '../channel/schema/channel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Poem.name, schema: PoemSchema },
      { name: Channel.name, schema: ChannelSchema },
    ]),
    TelegrafModule,
  ],
  providers: [BotUpdate, BotCommandsService, PoemSchedulerService],
  
})
export class BotModule {}
