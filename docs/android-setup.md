# Android Setup — Sideload + Obtainium (tap-to-update)

One-time setup on the target phone. After this, every release published to
GitHub triggers a notification on the phone; one tap opens the installer,
one more tap confirms the update.

## Why tap-to-update (not silent)

The original plan called for silent installs via `adb shell pm grant
INSTALL_PACKAGES`, but on modern Android (Pixel + Android 14+ at minimum),
`INSTALL_PACKAGES` is signature-protected and cannot be granted to a normal
app at runtime. Obtainium's "Install silently" toggle therefore only works
with one of: Shizuku, root, or device-owner setup — all of which add
brittleness (Shizuku breaks on reboot; root is a non-starter; device-owner
requires factory reset).

Tap-to-update is the realistic default for a non-rooted Pixel.

## Prerequisites

- Phone with Android 7+ (we target API 35).
- A published release on
  https://github.com/domicy/daily-habit-tracker/releases.
- The repo is public (Obtainium uses unauthenticated GitHub API calls; a
  private repo returns 404).

## Steps

### 1. Enable installation from unknown sources

Settings → Apps → Special app access → Install unknown apps → enable for the
browser or file manager that will receive the first APK, and for Obtainium
itself.

### 2. Install Obtainium

Download the latest Obtainium APK from
https://github.com/ImranR98/Obtainium/releases (or F-Droid) and install.
Obtainium self-updates from its own GitHub Releases after the first install.

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

- Update check interval: 1 hour (or any value you like).
- Auto-update: on.
- Notifications: on.
- Install method: leave at default ("Normal" / "Prompt"). Do **not** enable
  "Install silently" — see Why tap-to-update above.

### 5. Verify the loop

Trigger a release (push to `main`, or `gh workflow run ci.yml --ref main`).
Within the Obtainium poll interval (or sooner if you open Obtainium and
pull-to-refresh):

1. Obtainium shows a notification: "Updates available for DailyHabitTracker".
2. Tap the notification, or open Obtainium and tap the app.
3. Tap "Update" / "Install".
4. Android's standard installer appears; tap "Update".
5. Done. The app is on the new version.

## Troubleshooting

**Obtainium returns 404 when adding the URL.** Repo is private — make it
public, or configure Obtainium → the GitHub source with a fine-grained
Personal Access Token scoped to read this repo only.

**Update notification never appears.** Check, in order:
1. Network: is the phone online and Obtainium not battery-restricted?
2. Open Obtainium → tap the app → tap the refresh icon to force a check.
3. Compare versions: Obtainium shows installed vs. latest. If they match, no
   update was published.
4. Confirm the latest release on GitHub actually has `app-release.apk`
   attached as an asset.

**Install fails with "App not installed: package conflicts with existing
package".** Signature mismatch. Either the keystore changed (see Keystore
mismatch below) or you previously installed a debug build over the release
build (or vice versa). Resolve by uninstalling first, then reinstalling from
the GitHub release.

**Keystore mismatch:** A new keystore = a new signing identity = Android
rejects the APK replacement. Verify the GitHub secret
`ANDROID_KEYSTORE_BASE64` matches the keystore originally used to sign the
installed version. Recovery: uninstall + reinstall once (loses local-only
state; backend sync recovers data).

**`versionCode` regression.** Silent installs require monotonically
increasing `versionCode`. The release workflow uses `git rev-list --count
HEAD`, which should always increase on `main`. If someone force-pushed to
`main`, the count could regress; a force-push to revert that history fixes
it.

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

If v2 is false, Android may refuse the APK on modern firmware. Fix the
signing config in `android/app/build.gradle`.

## Release pipeline notes

The CI workflow (`.github/workflows/ci.yml`) runs the release job
automatically on every push to `main`. The `environment: production` block
is present in the YAML for future manual-approval support, but private free
GitHub repos cannot enforce the required-reviewer rule (it needs GitHub
Team). Since this repo is now public, the environment protection rules
*are* available — to enable: Settings → Environments → production →
Required reviewers → add self. Without it, every merge to `main` ships
immediately.

## Upgrade path: real silent install if you ever want it

Two options if tap-to-update becomes annoying:

1. **Shizuku.** Install from F-Droid, pair via Wireless Debugging (one-time
   ADB session, persists until phone reboot). Configure Obtainium →
   Installation → "Use Shizuku" → on. Catch: Shizuku service dies on phone
   reboot; user must reopen Shizuku and tap "Start via Wireless Debugging"
   to restore silent installs.

2. **Device owner.** Most powerful but requires factory reset + provisioning
   Obtainium as device owner. Not practical for an in-use phone.

Neither is recommended for the default setup.
