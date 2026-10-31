import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { isAllowedEmail } from "./lib/allowlist";
import { ResendOTP, ResendOTPReset } from "./otp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new ConvexError("invalidEmail");
        }
        // Runs for sign-up, sign-in and reset alike, before anything is stored.
        if (!isAllowedEmail(email)) {
          throw new ConvexError("notAllowed");
        }
        // Convex Auth hands these same params to the verify provider, which
        // stores params.email on the user, so normalize it there too.
        params.email = email;
        return { email };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new ConvexError("passwordTooShort");
        }
      },
      // A 6-digit code by email verifies the address at sign-up; kunji links
      // accounts across apps by verified email.
      verify: ResendOTP,
      reset: ResendOTPReset,
    }),
  ],
});
