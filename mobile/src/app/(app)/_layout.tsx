import { Stack, type ErrorBoundaryProps } from "expo-router";
import { ErrorScreen } from "@/components/error-screen";
import { strings } from "@/lib/strings";
import { useUpdateCheck } from "@/lib/use-update-check";

// title is also the browser tab title on web, so it stays the app name on
// every screen; headerTitle is what the screen header shows.
export default function AppLayout() {
  useUpdateCheck();
  return (
    <Stack screenOptions={{ headerTitleAlign: "left", title: strings.appName }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="note" />
      <Stack.Screen name="tag" />
      <Stack.Screen name="settings" options={{ headerTitle: strings.settings.title }} />
    </Stack>
  );
}

// Catches query errors from every app screen, e.g. notAllowed after the
// signed-in email is removed from ALLOWED_EMAILS.
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorScreen {...props} />;
}
