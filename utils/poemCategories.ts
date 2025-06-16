import { ObjectId } from 'mongoose';
import { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram';

export function allCategories(
  id: number | string | ObjectId,
  type: string,
): InlineKeyboardButton[][] {
  const categories: InlineKeyboardButton[][] = [
    [
      { text: '💘 عاشقانه', callback_data: `cat_عاشقانه_${id}` },
      { text: '💔 غمگین', callback_data: `cat_غمگین_${id}` },
    ],
    [
      { text: '😄 طنز', callback_data: `cat_طنز_${id}` },
      { text: '🕊️ عرفانی', callback_data: `cat_عرفانی_${id}` },
    ],
    [
      { text: '🧠 فلسفی', callback_data: `cat_فلسفی_${id}` },
      { text: '🇮🇷 حماسی', callback_data: `cat_حماسی_${id}` },
    ],
    [
      { text: '📖 مذهبی', callback_data: `cat_مذهبی_${id}` },
      { text: '🌿 طبیعت', callback_data: `cat_طبیعت_${id}` },
    ],
    [
      { text: '💭 اجتماعی', callback_data: `cat_اجتماعی_${id}` },
      { text: '🧸 کودکانه', callback_data: `cat_کودکانه_${id}` },
    ],
    [
      { text: '🎭 انتقادی', callback_data: `cat_انتقادی_${id}` },
      { text: '🎉 مناسبتی', callback_data: `cat_مناسبتی_${id}` },
    ],
  ];
  switch (type) {
    case 'CHANNEL':
      categories.push(
        [
          {
            text: '✨ همه',
            callback_data: `cat_همه_${id}`,
          },
          {
            text: '➕ افزودن',
            callback_data: `cat_بیشتر_${id}`,
          },
        ],
        [{ text: '✅ کافیه', callback_data: `cat_تمام_${id}` }],
      );
      return categories;

    case 'PRIVATE':
      return categories;

    default:
      throw new Error(`Unknown type ${type}`);
  }
}
