import { Directory, File, Paths } from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";

// In-app updates for the sideloaded APK, like sarathi's: the release build
// carries its short commit SHA (EXPO_PUBLIC_COMMIT, set by the Release
// workflow) and releases are tagged with the same SHA, so a different tag on
// the latest GitHub release means an update. The APK is downloaded into the
// app's cache and handed to Android's installer; the next launch deletes it.

const REPO = "mepkn/tippani";
const ASSET = "tippani.apk";
const UPDATE_DIR = new Directory(Paths.cache, "update");

export const currentCommit = process.env.EXPO_PUBLIC_COMMIT || "dev";

export type UpdateCheck =
  | { kind: "available"; tag: string; url: string }
  | { kind: "upToDate" }
  | { kind: "dev" };

export async function checkForUpdate(): Promise<UpdateCheck> {
  if (Platform.OS !== "android" || currentCommit === "dev") return { kind: "dev" };
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const release = (await res.json()) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  if (release.tag_name === currentCommit) return { kind: "upToDate" };
  const asset = release.assets.find((a) => a.name === ASSET);
  if (!asset) throw new Error(`Release ${release.tag_name} has no ${ASSET}`);
  return { kind: "available", tag: release.tag_name, url: asset.browser_download_url };
}

/** Downloads the APK and opens Android's installer (which asks to confirm). */
export async function installUpdate(url: string): Promise<void> {
  deleteDownloadedUpdates();
  UPDATE_DIR.create({ idempotent: true, intermediates: true });
  const apk = await File.downloadFileAsync(url, new File(UPDATE_DIR, ASSET));
  await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
    data: apk.contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

/**
 * Removes APKs downloaded by installUpdate. Run on launch: once the new
 * version is running, its installer file is no longer needed.
 */
export function deleteDownloadedUpdates(): void {
  try {
    if (UPDATE_DIR.exists) UPDATE_DIR.delete();
  } catch {
    // The cache is the system's to clear too; a leftover file is harmless.
  }
}
