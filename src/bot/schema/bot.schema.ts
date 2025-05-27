// bot/poem.schema.ts
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Poem extends Document {
  @Prop({ required: true })
  userId: number;

  @Prop()
  username?: string;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop({ required: true })
  text: string;

  @Prop({ default: false })
  sent: boolean;
}

export const PoemSchema = SchemaFactory.createForClass(Poem);
