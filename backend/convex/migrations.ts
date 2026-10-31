import { internalMutation } from "./_generated/server";

/**
 * One-off, run once per deployment when email verification was added: marks
 * every existing user verified, so they keep signing in without a code and
 * kunji can find them by email. Remove after it has run on prod.
 */
export const markUsersVerified = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let marked = 0;
    for (const user of await ctx.db.query("users").collect()) {
      if (user.emailVerificationTime !== undefined) continue;
      await ctx.db.patch("users", user._id, { emailVerificationTime: now });
      marked++;
    }
    return { marked };
  },
});
