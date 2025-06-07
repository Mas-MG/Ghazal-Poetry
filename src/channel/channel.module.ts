import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelSchema } from './schema/channel.schema';
import { Channel } from 'diagnostics_channel';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Channel.name, schema: ChannelSchema }]),
  ],
  providers: [ChannelService],
})
export class ChannelModule {}
