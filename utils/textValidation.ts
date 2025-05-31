export const isValidText = (input: string): boolean => {
  // Allowed chars: Arabic/Persian letters, spaces, zero-width non-joiner (\u200C), punctuation
  const pattern =
    /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s\u200C.,،!?؟؛\-']+$/;

  // Check digits anywhere
  const hasDigit = /[0-9\u06F0-\u06F9\u0660-\u0669]/.test(input);

  if (hasDigit) return false;

  // Normalize line breaks and split
  const lines = input
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Check number of lines: must be 2 or 4
  if (!(lines.length === 2 || lines.length === 4)) return false;

  // Check each line against allowed characters
  for (const line of lines) {
    if (!pattern.test(line)) return false;
  }

  return true;
};

// isValidNameOrCategory: allows Persian/Arabic letters and spaces only — no punctuation, no digits
export const isValidNameOrCategory = (input: string): boolean => {
  const onlyPersianLettersAndSpaces = /^[\u0600-\u06FF\s\u200C]+$/; // فقط حروف فارسی + فاصله + نیم‌فاصله
  const hasDigit = /[0-9\u06F0-\u06F9\u0660-\u0669]/.test(input);
  return onlyPersianLettersAndSpaces.test(input.trim()) && !hasDigit;
};
