// isValidText: allows Persian/Arabic letters, spaces, periods, commas — no digits at all
export const isValidText = (input: string): boolean => {
  const pattern = /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s.,،]+$/;
  const hasDigit = /[0-9\u06F0-\u06F9\u0660-\u0669]/.test(input);
  return pattern.test(input.trim()) && !hasDigit;
};

// isValidNameOrCategory: allows Persian/Arabic letters and spaces only — no punctuation, no digits
export const isValidNameOrCategory = (input: string): boolean => {
  const pattern = /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]+$/;
  const hasDigit = /[0-9\u06F0-\u06F9\u0660-\u0669]/.test(input);
  return pattern.test(input.trim()) && !hasDigit;
};
