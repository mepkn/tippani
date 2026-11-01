#!/usr/bin/env bash
# Builds the Android app with EAS.
#   scripts/build-android.sh <preview|production> <cloud|local>
# preview    → APK to install directly; production → AAB for the Play Store.
# cloud runs on EAS servers; local builds on this Mac (needs JDK 17 + Android SDK)
# and writes the file to mobile/dist/. Both read EXPO_PUBLIC_CONVEX_URL from the EAS
# environment of the same name.
set -euo pipefail
cd "$(dirname "$0")/../mobile"

profile="${1:-}"
where="${2:-}"
case "$profile" in preview|production) ;; *) echo "profile must be preview or production" >&2; exit 1 ;; esac
case "$where" in cloud|local) ;; *) echo "target must be cloud or local" >&2; exit 1 ;; esac

ext=$([ "$profile" = preview ] && echo apk || echo aab)

if [ "$where" = cloud ]; then
  exec ../scripts/eas.sh build --platform android --profile "$profile" --non-interactive
fi

mkdir -p dist
out="dist/tippani-$profile-$(date +%Y%m%d-%H%M).$ext"
../scripts/eas.sh build --platform android --profile "$profile" --local --non-interactive --output "$out"
echo "› Built $out"
if [ "$ext" = apk ]; then
  echo "  Install on a connected phone: adb install -r mobile/$out"
fi
