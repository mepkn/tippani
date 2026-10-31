import { useEffect } from "react";
import { Alert } from "react-native";
import { strings } from "./strings";
import { checkForUpdate, currentCommit, deleteDownloadedUpdates, installUpdate } from "./update";

const s = strings.update;

/** Checks for a new release; manual (from Settings) also reports "up to date" and errors. */
export async function runUpdateCheck(manual: boolean): Promise<void> {
  try {
    const result = await checkForUpdate();
    if (result.kind === "available") {
      Alert.alert(s.availableTitle, s.availableMessage(result.tag, currentCommit), [
        { text: s.later, style: "cancel" },
        {
          text: s.install,
          onPress: () => {
            installUpdate(result.url).catch((e: unknown) =>
              Alert.alert(s.failedTitle, e instanceof Error ? e.message : String(e)),
            );
          },
        },
      ]);
    } else if (manual) {
      if (result.kind === "dev") Alert.alert(s.devTitle, s.devMessage);
      else Alert.alert(s.upToDateTitle, s.upToDateMessage(currentCommit));
    }
  } catch (e) {
    if (manual) Alert.alert(s.failedTitle, e instanceof Error ? e.message : String(e));
  }
}

/** On launch: delete the APK an earlier update left, then look for a new one. */
export function useUpdateCheck(): void {
  useEffect(() => {
    deleteDownloadedUpdates();
    void runUpdateCheck(false);
  }, []);
}
