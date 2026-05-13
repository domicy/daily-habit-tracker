# Android Setup — Sideload + Obtainium

One-time setup on the target phone. After this, every release published to
GitHub installs silently within the Obtainium poll interval.

## Prerequisites

- Phone with Android 7+ (we target API 35).
- Laptop with `adb` installed (`brew install android-platform-tools` on macOS,
  or the SDK Platform-Tools from Android Studio on Linux/Windows).
- A published release on
  https://github.com/domicy/daily-habit-tracker/releases.

## Steps

### 1. Enable installation from unknown sources

Settings → Apps → Special app access → Install unknown apps → enable for the
browser or file manager that will receive the first APK.

### 2. Install Obtainium

Download the latest Obtainium APK from
https://github.com/ImranR98/Obtainium/releases and install. Obtainium self-
updates from its own GitHub Releases after the first install.

### 3. First install of DailyHabitTracker

On the phone, open the latest release on
https://github.com/domicy/daily-habit-tracker/releases, tap
`app-release.apk`, install. Open the app once, allow notifications when
prompted.

### 4. Configure Obtainium

Open Obtainium → "+" → paste
`https://github.com/domicy/daily-habit-tracker` → save. Confirm
association with the installed DailyHabitTracker app.

In Obtainium settings:

- Update check interval: 1 hour.
- Auto-update: on.
- Install method: "Silently" (requires the ADB grant in step 5).

### 5. Grant Obtainium silent-install permission (one-time, via ADB)

Enable USB debugging: Settings → About phone → tap Build Number 7 times,
then Developer Options → USB debugging → on.

Plug the phone into your laptop, accept the RSA prompt, then run:

```bash
adb shell pm grant <OBTAINIUM_PACKAGE_NAME> android.permission.INSTALL_PACKAGES
```

Replace `<OBTAINIUM_PACKAGE_NAME>` with the actual package name. To find it:

```bash
adb shell pm list packages | grep -i obtainium
```

At the time of writing this doc the package name is `<INSERT VERIFIED NAME>`.
Obtainium's namespace has shifted across versions, so always verify.

### 6. Verify the loop

Trigger a release (push to `main`, or `gh workflow run ci.yml --ref main`).
Wait up to one hour. The phone should install the update silently — no
notification, no tap.

## Troubleshooting

Silent updates stopped working? Check, in order of likelihood:

1. **ADB grant lost.** Re-run `adb shell pm grant ... INSTALL_PACKAGES`. The
   grant does NOT survive a factory reset, and may not survive an Obtainium
   reinstall on some Android versions.
2. **Obtainium package name changed.** If `pm grant` reports "Unknown
   package," verify with `pm list packages | grep obtainium`.
3. **Keystore mismatch.** A new keystore = a new signing identity =
   Android rejects the APK replacement. Verify the GitHub secret
   `ANDROID_KEYSTORE_BASE64` matches the keystore originally used to sign
   the installed version.
4. **versionCode didn't increment.** Silent installs require monotonically
   increasing `versionCode`. The release workflow uses
   `git rev-list --count HEAD`, which should always increase on `main`. If
   someone force-pushed to `main`, the count could regress.
5. **Network blocked.** Confirm the phone has internet access during the
   Obtainium update window.

## Apksigner verification (one-time, after first release)

After the first release publishes, download the APK and confirm v2 + v3
signing:

```bash
gh release download <tag> -p app-release.apk
apksigner verify --verbose app-release.apk
```

Expected:

```
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
```

If v2 is false, silent updates via Obtainium will not work. Fix the signing
config in `android/app/build.gradle` and reinstall.

## Release pipeline notes

This repo's CI workflow (`.github/workflows/ci.yml`) runs the release job
automatically on every push to `main`, with no manual approval gate (GitHub
free-tier private repos cannot enforce `environment` protection rules
without GitHub Team). Every merge to `main` ships to the phone. Use commit
discipline accordingly: if you need to pause shipping, either pause
Obtainium on the phone or commit-revert quickly to ship a fix-forward
release.
