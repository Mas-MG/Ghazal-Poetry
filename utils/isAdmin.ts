import { Context } from 'telegraf';

export async function isAdminFn(
  ctx: Context,
  chatId: string,
): Promise<boolean> {
  const userId = ctx.from?.id;

  if (!chatId || !userId) return false;

  const admins = await ctx.telegram.getChatAdministrators(chatId);
  return admins.some((admin) => admin.user.id === userId);
}
