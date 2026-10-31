import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AuthStep, authErrorMessage } from "@/lib/errors";
import { strings } from "@/lib/strings";

const s = strings.auth;

const COPY: Record<AuthStep, { title: string; subtitle: string | ((email: string) => string); submit: string }> = {
  signIn: { title: s.signInTitle, subtitle: s.signInSubtitle, submit: s.logIn },
  signUp: { title: s.signUpTitle, subtitle: s.signUpSubtitle, submit: s.signUp },
  verify: { title: s.verifyTitle, subtitle: s.verifySubtitle, submit: s.verify },
  forgot: { title: s.forgotTitle, subtitle: s.forgotSubtitle, submit: s.sendCode },
  reset: { title: s.resetTitle, subtitle: s.resetSubtitle, submit: s.resetPassword },
};

// Each step sends one Convex Auth Password flow.
const FLOWS: Record<AuthStep, string> = {
  signIn: "signIn",
  signUp: "signUp",
  verify: "email-verification",
  forgot: "reset",
  reset: "reset-verification",
};

/**
 * Email + password, with a 6-digit code by email to verify the address at
 * sign-up (and on sign-in if it never was) and to reset a forgotten password.
 * Sign-up only works for emails in ALLOWED_EMAILS.
 */
export function SignInPage() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<AuthStep>("signIn");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function go(next: AuthStep) {
    setStep(next);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("email", email.trim().toLowerCase());
    formData.set("flow", FLOWS[step]);
    try {
      const { signingIn } = await signIn("password", formData);
      // Not signed in yet means a code was emailed: sign-up, an unverified
      // sign-in, or a reset request.
      if (!signingIn) go(step === "forgot" ? "reset" : "verify");
    } catch (err) {
      setError(authErrorMessage(err, step));
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[step];
  const subtitle = typeof copy.subtitle === "function" ? copy.subtitle(email.trim().toLowerCase()) : copy.subtitle;
  const codeStep = step === "verify" || step === "reset";
  const needsPassword = step === "signIn" || step === "signUp" || step === "reset";

  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex w-full flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-lg font-semibold">{copy.title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <form onSubmit={submit} key={step} className="flex flex-col gap-4">
            {!codeStep && (
              <div className="grid gap-2">
                <Label htmlFor="email">{s.email}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            {codeStep && (
              <div className="grid gap-2">
                <Label htmlFor="code">{s.code}</Label>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
            )}
            {needsPassword && (
              <div className="grid gap-2">
                <Label htmlFor="password">{step === "reset" ? s.newPassword : s.password}</Label>
                <Input
                  id="password"
                  name={step === "reset" ? "newPassword" : "password"}
                  type="password"
                  minLength={8}
                  autoComplete={step === "signIn" ? "current-password" : "new-password"}
                  required
                />
                {step !== "signIn" && <p className="text-xs text-muted-foreground">{s.passwordHint}</p>}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              {copy.submit}
            </Button>
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              {step === "signIn" && (
                <>
                  <LinkButton onClick={() => go("forgot")}>{s.forgotPassword}</LinkButton>
                  <LinkButton onClick={() => go("signUp")}>{s.noAccount}</LinkButton>
                </>
              )}
              {step === "signUp" && <LinkButton onClick={() => go("signIn")}>{s.haveAccount}</LinkButton>}
              {step !== "signIn" && step !== "signUp" && <LinkButton onClick={() => go("signIn")}>{s.back}</LinkButton>}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" className="underline-offset-4 hover:text-foreground hover:underline" onClick={onClick}>
      {children}
    </button>
  );
}
