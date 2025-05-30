export function normalizePoemText(text: string): string {
  return text
    .replace(/[^\p{L}\u0600-\u06FF]+/gu, ' ') // keep only letters (Unicode range for Arabic script), remove punctuation/numbers
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim() // remove leading/trailing spaces
    .toLowerCase(); // normalize case
}
