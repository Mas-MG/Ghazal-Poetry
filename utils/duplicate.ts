export function normalizePoemText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀ]/g, 'ه')
    .replace(/[0-9۰-۹]/g, '')
    .replace(/[\u064B-\u0652]/g, '') // حذف اعراب
    .replace(/[^\p{L}\u0600-\u06FF]+/gu, '') // حذف غیر حروف (اعداد، نقطه، فاصله و ...)
    .toLowerCase()
    .trim();
}
