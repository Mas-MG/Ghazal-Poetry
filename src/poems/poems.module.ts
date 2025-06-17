import { Module } from '@nestjs/common';
import { PoemsService } from './poems.service';
import { PoemsController } from './poems.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Poem, PoemSchema } from 'src/bot/schema/bot.schema';
import { Channel } from 'diagnostics_channel';
import { ChannelSchema } from 'src/channel/schema/channel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Poem.name, schema: PoemSchema },
      { name: Channel.name, schema: ChannelSchema },
    ]),
  ],
  providers: [PoemsService],
  controllers: [PoemsController],
})
export class PoemsModule {}
