import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChannelDocument = Channel & Document;

@Schema({ timestamps: true })
export class Channel {
  @Prop({ required: true, unique: true })
  channelId: string;

  @Prop({ required: true})
  channelAdminId: string;

  @Prop()
  title: string;

  @Prop({ enum: ['9_18', '17_24'], required: true, default: '9_18' })
  timeRange: string;

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ default: false })
  allCategories: boolean;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
