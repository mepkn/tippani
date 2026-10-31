import { useAuthActions } from "@convex-dev/auth/react";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CmpButton } from "@/components/cmp/cmp-button";
import { CmpInput } from "@/components/cmp/cmp-field";
import { CmpKeyboardAwareScrollView } from "@/components/cmp/cmp-keyboard-aware-scroll-view";
import { CmpText } from "@/components/cmp/cmp-text";
import { type AuthStep, authErrorMessage } from "@/lib/errors";
import { strings } from "@/lib/strings";

type Flow = "signIn" | "signUp";

const s = strings.auth;

// Each step sends one Convex Auth Password flow.
const FLOWS: Record<AuthStep, string> = {
  signIn: "signIn",
  signUp: "signUp",
  verify: "email-verification",
  forgot: "reset",
  reset: "reset-verification",
};

const COPY: Record<AuthStep, { title: string; subtitle: string | ((email: string) => string); submit: string }> = {
  signIn: { title: s.signInTitle, subtitle: s.signInSubtitle, submit: s.logIn },
  signUp: { title: s.signUpTitle, subtitle: s.signUpSubtitle, submit: s.signUp },
  verify: { title: s.verifyTitle, subtitle: s.verifySubtitle, submit: s.verify },
  forgot: { title: s.forgotTitle, subtitle: s.forgotSubtitle, submit: s.sendCode },
  reset: { title: s.resetTitle, subtitle: s.resetSubtitle, submit: s.resetPassword },
};

/**
 * Email + password, with a 6-digit code by email to verify the address at
 * sign-up (and on sign-in if it never was) and to reset a forgotten password.
 */
export function AuthForm({ flow }: { flow: Flow }) {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<AuthStep>(flow);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const codeStep = step === "verify" || step === "reset";
  const needsPassword = step === "signIn" || step === "signUp" || step === "reset";
  const newPassword = step === "signUp" || step === "reset";

  function go(next: AuthStep) {
    setStep(next);
    setError(undefined);
    setCode("");
    setPassword("");
  }

  async function submit() {
    setError(undefined);
    if (newPassword && password.length < 8) {
      setError(strings.errors.passwordTooShort);
      return;
    }
    const params: Record<string, string> = { email: email.trim().toLowerCase(), flow: FLOWS[step] };
    if (codeStep) params.code = code.trim();
    if (step === "reset") params.newPassword = password;
    else if (needsPassword) params.password = password;
    setSubmitting(true);
    try {
      const { signingIn } = await signIn("password", params);
      // Not signed in yet means a code was emailed: sign-up, an unverified
      // sign-in, or a reset request.
      if (!signingIn) go(step === "forgot" ? "reset" : "verify");
    } catch (e) {
      setError(authErrorMessage(e, step));
    } finally {
      setSubmitting(false);
    }
  }

  const copy = COPY[step];
  const subtitle = typeof copy.subtitle === "function" ? copy.subtitle(email.trim().toLowerCase()) : copy.subtitle;
  const ready = codeStep
    ? code.trim().length === 6 && (step !== "reset" || password.length > 0)
    : email.trim().length > 0 && (!needsPassword || password.length > 0);

  return (
    <SafeAreaView className="bg-background flex-1">
      <CmpKeyboardAwareScrollView contentContainerClassName="mx-auto w-full max-w-md flex-grow justify-center gap-6 p-6">
        <View className="gap-2">
          <CmpText className="text-brand text-lg font-semibold">{strings.appName}</CmpText>
          <CmpText variant="h3">{copy.title}</CmpText>
          <CmpText variant="muted">{subtitle}</CmpText>
        </View>
        <View className="gap-4">
          {!codeStep && (
            <CmpInput
              label={s.email}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              onSubmitEditing={step === "forgot" ? submit : undefined}
            />
          )}
          {codeStep && (
            <CmpInput
              label={s.code}
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              onSubmitEditing={step === "verify" ? submit : undefined}
            />
          )}
          {needsPassword && (
            <CmpInput
              label={step === "reset" ? s.newPassword : s.password}
              hint={newPassword ? s.passwordHint : undefined}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={newPassword ? "new-password" : "current-password"}
              textContentType={newPassword ? "newPassword" : "password"}
              onSubmitEditing={submit}
            />
          )}
          {error && <CmpText className="text-destructive text-sm">{error}</CmpText>}
          <CmpButton label={copy.submit} loading={submitting} disabled={!ready} onPress={submit} />
        </View>
        <View className="items-center gap-1">
          {step === "signIn" && <CmpButton variant="link" label={s.forgotPassword} onPress={() => go("forgot")} />}
          {step === flow ? (
            <Link href={flow === "signUp" ? "/sign-in" : "/sign-up"} replace asChild>
              <CmpButton variant="link" label={flow === "signUp" ? s.haveAccount : s.noAccount} />
            </Link>
          ) : (
            <CmpButton variant="link" label={s.back} onPress={() => go(flow)} />
          )}
        </View>
      </CmpKeyboardAwareScrollView>
    </SafeAreaView>
  );
}
