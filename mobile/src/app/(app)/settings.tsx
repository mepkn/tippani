import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { LogOut } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { api } from "@convex/_generated/api";
import { CmpButton } from "@/components/cmp/cmp-button";
import { CmpCard, CmpCardContent, CmpCardHeader, CmpCardTitle } from "@/components/cmp/cmp-card";
import { CmpSegmented } from "@/components/cmp/cmp-segmented";
import { CmpText } from "@/components/cmp/cmp-text";
import { usePreferences, type ThemePref } from "@/lib/preferences";
import { strings } from "@/lib/strings";
import { currentCommit } from "@/lib/update";
import { runUpdateCheck } from "@/lib/use-update-check";

const s = strings.settings;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <CmpCard>
      <CmpCardHeader>
        <CmpCardTitle>{title}</CmpCardTitle>
      </CmpCardHeader>
      <CmpCardContent className="gap-3">{children}</CmpCardContent>
    </CmpCard>
  );
}

export default function SettingsScreen() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const { theme, setTheme } = usePreferences();
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="mx-auto w-full max-w-xl gap-4 p-4 pb-12">
      <Section title={s.account}>
        <View className="gap-0.5">
          <CmpText variant="muted">{s.signedInAs}</CmpText>
          <CmpText>{me?.email ?? "…"}</CmpText>
        </View>
        <CmpButton
          variant="outline"
          icon={LogOut}
          label={strings.auth.logOut}
          loading={loggingOut}
          onPress={async () => {
            setLoggingOut(true);
            try {
              await signOut();
            } finally {
              setLoggingOut(false);
            }
          }}
        />
      </Section>

      <Section title={s.appearance}>
        <CmpSegmented<ThemePref>
          value={theme}
          onChange={setTheme}
          options={(["light", "dark", "system"] as const).map((value) => ({
            value,
            label: s.themes[value],
          }))}
        />
      </Section>

      <Section title={strings.update.section}>
        <CmpText variant="muted">{strings.update.version(currentCommit)}</CmpText>
        <CmpButton variant="outline" label={strings.update.check} onPress={() => void runUpdateCheck(true)} />
      </Section>
    </ScrollView>
  );
}

