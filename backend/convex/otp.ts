import Resend from "@auth/core/providers/resend";
import { env } from "./lib/env";

const FROM = "Tippani <noreply@send.pknspace.com>";

/** A 6-digit code; the modulo bias over 2^32 is negligible. */
function code(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n % 1_000_000).padStart(6, "0");
}

// Emails the code through Resend. Without RESEND_API_KEY (local dev) the code
// is only logged, so it shows in the `npx convex dev` output.
async function sendCode(to: string, subject: string, text: string) {
  const apiKey = env().RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[otp] ${to}: ${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Could not send the email: ${res.status} ${await res.text()}`);
}

/** Verifies the email at sign-up. */
export const ResendOTP = Resend({
  id: "resend-otp",
  apiKey: "unused",
  maxAge: 15 * 60,
  generateVerificationToken: async () => code(),
  async sendVerificationRequest({ identifier: email, token }) {
    await sendCode(
      email,
      `${token} is your Tippani code`,
      `Your Tippani verification code is ${token}. It expires in 15 minutes.`,
    );
  },
});

/** Resets a forgotten password. */
export const ResendOTPReset = Resend({
  id: "resend-otp-reset",
  apiKey: "unused",
  maxAge: 15 * 60,
  generateVerificationToken: async () => code(),
  async sendVerificationRequest({ identifier: email, token }) {
    await sendCode(
      email,
      `${token} is your Tippani reset code`,
      `Your Tippani password reset code is ${token}. It expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    );
  },
});
