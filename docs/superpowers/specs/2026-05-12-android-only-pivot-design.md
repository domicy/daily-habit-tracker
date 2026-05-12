# Android-Only Pivot — Design

**Date:** 2026-05-12
**Status:** Approved (pending user review)
**Author:** Patrick Darling, with Claude

## Motivation

`DailyHabitTracker` was built as a React Native project but operationally has only ever shipped to iOS — the repo has an `ios/` directory and Podfile, scripts and Detox target iOS only, the README states "React Native iOS app," and CI runs E2E on a macOS runner. There is no `android/` directory.

The only user of this app is the author's wife. She has switched from iOS to a Pixel 10a. There is no remaining reason to support iOS. The pivot is to delete iOS entirely, scaffold Android, and ship updates to her phone over the air via a sideload + Obtainium pipeline.

The end-state experience: code lands on `main` → CI signs and publishes a GitHub Release → Obtainium on her phone detects it within an hour → APK installs silently with no user action.

## Locked-in decisions

| # | Topic | Choice |
|---|---|---|
| 1 | Motivation | Single-user pivot; wife on Pixel 10a; no iOS users to migrate |
| 2 | Distribution | Sideload signed APKs from GitHub Releases, delivered via Obtainium |
| 3 | Automation | Tier B (every merge to `main` ships) + Tier C (silent install via ADB-granted Obtainium) + manual approval gate before each release |
| 4 | CI gates | Lint, typecheck, frontend unit tests (Jest), backend unit tests (pytest), Android release-build verification. No E2E. |
| 5 | Backend | Keep as-is; cloud sync deploys via existing Cloudflared tunnel; unchanged |
| 6 | iOS cleanup | Delete `ios/`, `e2e/`, `.detoxrc.js`, all Detox dependencies, all `Platform.OS === 'ios'` branches |
| 7 | App identity | Name `DailyHabitTracker`; applicationId `com.darling.dailyhabittracker` |
| 8 | Repo name | Rename `fitness-app-habits` → `daily-habit-tracker` before scaffolding (prerequisite) |
| 9 | Data migration | None — start fresh on Android |
| 10 | Keystore | Generate locally; store as GitHub encrypted secrets + 1Password attachment + external drive backup |
| 11 | Branch protection | Allow direct pushes to `main`; approval gate happens in release workflow, not at merge time |
| 12 | versionCode | `git rev-list --count HEAD` (full clone in CI via `fetch-depth: 0`) |
| 13 | versionName | `v<package.json.version>-r<rev-count>` |
| 14 | Min/target SDK | min 24, target 35, compile 35 |
| 15 | Release notes | GitHub `--generate-notes` from PR titles + commits since previous tag |
| 16 | Adaptive icon | Derive from current iOS app icon |
| 17 | Notification permissions | `POST_NOTIFICATIONS`, `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `INTERNET` |
| 18 | Signing scheme | APK Signature Scheme v2 + v3 (Gradle default); verified via `apksigner verify --verbose` in CI |

## Out of scope

- iOS support (deleting, not pausing).
- E2E test coverage (Detox iOS deleted; Android Detox not added).
- Play Store distribution (sideload via Obtainium only).
- Crash reporting (Sentry, Crashlytics) — not added.
- Per-user account system or multi-user support — single user.
- Data migration tooling — wife is starting fresh.
- Repo split or monorepo restructure — `backend/` stays in-tree.

## Architecture

Three deliverables, in this order:

1. **Repository**: scaffold `android/`, delete `ios/`, simplify cross-platform code, update CI.
2. **Release pipeline**: GitHub Actions workflow that on push to `main` builds a signed release APK, runs an approval gate, publishes a tagged GitHub Release with the APK attached.
3. **Phone setup**: one-time configuration on the Pixel 10a — install Obtainium, configure repo URL, grant `INSTALL_PACKAGES` via ADB so updates install silently.

After the one-time phone setup, the steady-state developer loop is: push to `main` → click "Approve" in GitHub Actions → wait. No further touch on the phone, no further touch on the build chain.

---

## Section 1 — Repository structure

### Removed

- `ios/` directory (Podfile + future Xcode artifacts)
- `e2e/` directory (Detox tests, all iOS-only)
- `.detoxrc.js`

### `package.json` edits

- Remove scripts: `ios`, `test:e2e:build`, `test:e2e`.
- Add script: `android` — value matches whatever `react-native init` emits (`react-native run-android` or `npx react-native run-android`); confirmed at scaffold time, not assumed.
- Remove `devDependencies`: `detox`, `@types/detox`, `jest-circus`, `@react-native-community/cli-platform-ios`.

### Added

- `android/` directory — generated via the current RN 0.78 init command (verified against `react-native.dev` docs at execution time; the historical `--template react-native-template-typescript` flag is dead since RN 0.71).
- `android/keystore.properties.example` — checked-in template. The real `keystore.properties` is gitignored.
- `docs/android-setup.md` — one-time phone setup, ADB grant procedure, troubleshooting.

(Release pipeline lives in the existing `.github/workflows/ci.yml` as a new `release` job — see Section 4.)

### Modified

- `src/services/NotificationService.ts` — rewrite iOS-flavored comments, drop the `if (Platform.OS === 'android')` channel-creation gate (call becomes unconditional), drop `Platform` import.
- `src/theme/typography.ts` — replace `Platform.OS === 'ios' ? 'San Francisco' : 'sans-serif'` style branches with the Android-only string values (`'sans-serif'`, `'monospace'`); drop `Platform` import.
- `src/screens/CreateHabitModal.tsx` — `behavior="height"` unconditional; drop `Platform` import.
- `src/App.tsx`, `src/services/api.ts`, `src/__tests__/services/SyncService.test.ts` — re-grep at implementation time. Initial scan suggests only comments / string occurrences, no real branches. If branches are found, the deletion rule is **delete the whole conditional block, not "keep the default"** (an `if (Platform.OS === 'ios') { … }` with no `else` becomes nothing).
- `README.md` — remove iOS prerequisites (Ruby, Xcode, CocoaPods), iOS-specific instructions, iOS troubleshooting section. Replace with Android setup instructions and the new CI job table.
- `.github/workflows/ci.yml` — remove `e2e-tests` job; add `android-build` and `release` jobs (see Section 4).

---

## Section 2 — Android native scaffold

### `android/app/build.gradle`

- `applicationId "com.darling.dailyhabittracker"`
- `minSdkVersion 24`, `targetSdkVersion 35`, `compileSdkVersion 35`
- `versionCode` reads env `VERSION_CODE` (default `1` for local builds)
- `versionName` reads env `VERSION_NAME` (default `"dev"` for local builds)
- **Signing config with debug fallback**: `signingConfigs.release` is populated from `android/keystore.properties` only if that file exists. `buildTypes.release.signingConfig` is set conditionally — real keystore if present, else falls back to `signingConfigs.debug`. This is the critical pattern that lets the CI gate's `android-build` job run `./gradlew assembleRelease` without ever decoding the real keystore (gate uses debug signing), while the `release` job — which does write `keystore.properties` from secrets — gets real signing.

```groovy
signingConfigs {
    release {
        def keystorePropsFile = rootProject.file('keystore.properties')
        if (keystorePropsFile.exists()) {
            def props = new Properties()
            keystorePropsFile.withInputStream { props.load(it) }
            storeFile rootProject.file(props['storeFile'])
            storePassword props['storePassword']
            keyAlias props['keyAlias']
            keyPassword props['keyPassword']
        }
    }
}

buildTypes {
    release {
        def keystorePropsFile = rootProject.file('keystore.properties')
        signingConfig keystorePropsFile.exists() ? signingConfigs.release : signingConfigs.debug
        // standard RN release flags: minifyEnabled, proguardFiles, etc.
    }
}
```

The release APK signed with debug is not shippable (debug signature can't replace a release-signed install on her phone), but the gate is only verifying that the build *compiles + bundles*, not that the artifact is publishable. The real `release` job re-builds with the decoded keystore.

### `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.VIBRATE" />
```

Rationale:
- `INTERNET` — backend sync.
- `POST_NOTIFICATIONS` — Android 13+ runtime prompt for notification delivery; handled by Notifee's `requestPermission()`.
- `USE_EXACT_ALARM` (not `SCHEDULE_EXACT_ALARM`) — auto-granted at install on SDK 33+, no user trip to system settings required. The Play Store gates this behind policy review, but Obtainium distribution is not subject to that constraint. Habit reminders are an exact-alarm use case.
- `RECEIVE_BOOT_COMPLETED` — Notifee's scheduled triggers do not survive reboot without this. Without it, reminders would silently die after every reboot, which is the worst kind of bug for a habit tracker.
- `VIBRATE` — defensive. Notifee's high-importance channels can vibrate by default even without explicit pattern config.

### Native dependencies

- WatermelonDB: add `apply from: '../../node_modules/@nozbe/watermelondb/native/android-jsi/build.gradle'` and register the package in `MainApplication.kt`. This is the one native dep that needs Android-specific wiring beyond autolink.
- Notifee: autolinked; ProGuard rules ship with the package.
- All other deps: autolinked, no manual wiring.

### Adaptive icon

Foreground + background layers at `android/app/src/main/res/mipmap-*/`. Source: current iOS app icon (likely `ios/DailyHabitTracker/Images.xcassets/AppIcon.appiconset/` if present at deletion time — extract before deleting `ios/`).

---

## Section 3 — Signing & keystore

### Generation (one-time, local)

```
keytool -genkeypair -v -keystore release.keystore \
  -alias dailyhabittracker -keyalg RSA -keysize 2048 -validity 10000
```

Password: strong, recorded in 1Password.

### Storage

- `release.keystore` → 1Password attachment + external drive backup. Never in the repo.
- Base64-encoded keystore → GitHub repo secret `ANDROID_KEYSTORE_BASE64`.
- Keystore password → GitHub repo secret `ANDROID_KEYSTORE_PASSWORD`.
- Key alias → GitHub repo secret `ANDROID_KEY_ALIAS`.
- Key password → GitHub repo secret `ANDROID_KEY_PASSWORD`.

### Build-time wiring

CI workflow:
1. Decodes `ANDROID_KEYSTORE_BASE64` → `android/release.keystore`.
2. Writes `android/keystore.properties` from the password/alias secrets.
3. Gradle release variant reads `keystore.properties` for the signing config.

`android/keystore.properties` and `android/release.keystore` are gitignored.

### Loss recovery

If both the 1Password attachment and the external drive copy are lost, silent updates die forever — Android refuses APK replacement across signing identities. Recovery: uninstall + reinstall once, losing any local-only state. Backend sync makes data recoverable in that case.

### Signature scheme verification

After the first CI release build, CI runs `apksigner verify --verbose app-release.apk` and fails if v2 is not present. Modern RN defaults emit v2 + v3 + v4; this is a defensive check, not an expected failure point. Output documented in `docs/android-setup.md`.

---

## Section 4 — CI/CD pipeline

### Single-workflow design

`ci.yml` is the only workflow. It contains both the pre-merge gates and the release job. The release job depends on all gates via `needs:` and is restricted to `push: main` (plus `workflow_dispatch` for dry-runs) via an `if:` condition. This guarantees a broken build cannot ship even if approval is clicked carelessly.

### `.github/workflows/ci.yml`

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test -- --coverage --ci

  backend-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r requirements.txt
      - run: pytest --cov-fail-under=85

  android-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }
      - run: npm ci
      - run: cd android && ./gradlew assembleRelease     # debug keystore at this stage; release variant builds, doesn't publish

  release:
    needs: [lint-and-typecheck, unit-tests, backend-tests, android-build]
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    environment: production   # manual approval gate (requires reviewers configured in repo settings)
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0      # required for git rev-list --count HEAD
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }
      - run: npm ci
      - name: Derive version
        id: version
        run: |
          VERSION=$(node -p "require('./package.json').version")
          RUN_COUNT=$(git rev-list --count HEAD)
          echo "VERSION_CODE=$RUN_COUNT" >> $GITHUB_ENV
          echo "VERSION_NAME=v${VERSION}-r${RUN_COUNT}" >> $GITHUB_ENV
          echo "version_name=v${VERSION}-r${RUN_COUNT}" >> $GITHUB_OUTPUT
      - name: Decode keystore
        run: |
          printf '%s' "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/release.keystore
          cat > android/keystore.properties <<EOF
          storeFile=release.keystore
          storePassword=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          keyAlias=${{ secrets.ANDROID_KEY_ALIAS }}
          keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}
          EOF
      - run: cd android && ./gradlew assembleRelease
      - name: Verify signing
        run: apksigner verify --verbose android/app/build/outputs/apk/release/app-release.apk
      - name: Publish release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "${{ steps.version.outputs.version_name }}" \
            android/app/build/outputs/apk/release/app-release.apk \
            --generate-notes \
            --target ${{ github.sha }}
```

Gate matrix:

| Job | Required? | When it runs | Notes |
|---|---|---|---|
| `lint-and-typecheck` | Yes | Every push + PR | ~1 min |
| `unit-tests` | Yes | Every push + PR | 80% line/function/branch threshold (existing) |
| `backend-tests` | Yes | Every push + PR | 85% line threshold (existing) |
| `android-build` | Yes | Every push + PR | Build-verification only with debug keystore; catches native module / ProGuard / manifest issues |
| `release` | n/a | Only on push to `main` or `workflow_dispatch`, only after all four gates pass, only after manual approval | Real keystore, publishes GitHub Release |

Removed: `e2e-tests` job and all macOS runner usage.

Key properties:
- All four gate jobs must pass before `release` is even scheduled (`needs:`). A failing gate aborts the release path entirely.
- `workflow_dispatch:` from `main` lets you dry-run the signing path without merging. The release `if:` requires `main` regardless of event type, so a dispatch from a feature branch won't publish — it'll skip the release job entirely. The approval gate still fires when dispatched from `main`; gate jobs still run; nothing about the safety chain is bypassed.
- `fetch-depth: 0` is required for `git rev-list --count HEAD` to return the real commit count (default shallow clone returns 1).
- `VERSION_NAME` is derived once from `package.json` + commit count, used everywhere (Gradle env, release tag, release title via auto-notes). No literal version string anywhere in the YAML.
- `versionCode = git rev-list --count HEAD` survives workflow rename, file move, or workflow recreation — unlike `github.run_number`, which is per-workflow-file and resets on rename.
- The `environment: production` requires the user to create a GitHub environment with that name in repo Settings → Environments and add themselves as a required reviewer. This is one-time config outside the YAML.

---

## Section 5 — Release & distribution

### Versioning

- `versionCode` (integer, must monotonically increase for silent updates): `$(git rev-list --count HEAD)`.
- `versionName` (user-visible string): `v<package.json.version>-r<rev-count>`, e.g. `v0.1.0-r42`.

### GitHub Release

- Tag: `<versionName>` (e.g., `v0.1.0-r42` — `versionName` already includes the `v` prefix).
- Title: same as tag.
- Body: GitHub `--generate-notes` (PR titles + commits since previous tag).
- Asset: `app-release.apk` attached directly. **Must not** be archived — Obtainium downloads the raw APK asset.

### Obtainium configuration (on her phone)

| Setting | Value |
|---|---|
| App source | GitHub |
| Repo URL | `https://github.com/<owner>/daily-habit-tracker` (after repo rename) |
| Track | Releases (default) |
| Asset filter | `.*\.apk$` (default) |
| Update check interval | 1 hour |
| Install method | Silently (requires ADB grant — see Section 6) |
| Auto-update | Enabled |

### Cadence

Every push to `main` produces one release after approval. No path filter — over-shipping a no-op APK is acceptable (silent install, same applicationId, version bump). A path filter "only release if `src/` or `android/` changed" is a future optimization.

---

## Section 6 — Phone-side setup (one-time, ~15 min)

Documented in `docs/android-setup.md`. Done once on the Pixel 10a, then untouched.

### Steps

1. **Enable installation from unknown sources** — Settings → Apps → Special app access → Install unknown apps → enable for the browser/file manager that will receive the first APK.
2. **Install Obtainium** — Download Obtainium APK from `https://github.com/ImranR98/Obtainium/releases`. Sideload once. Obtainium self-updates from its own GitHub Releases thereafter.
3. **First install of DailyHabitTracker** — Trigger a release (push to `main` or `workflow_dispatch`), approve, wait for the release to publish, open the GitHub Release page on her phone, tap `app-release.apk`, install. Open the app, exercise the notification permission prompt.
4. **Configure Obtainium** — Add app → paste GitHub repo URL → save. Obtainium discovers releases and associates with the installed app.
5. **Grant ADB silent-install permission** — Plug phone into laptop, USB debugging on, then:
   ```
   adb shell pm grant <obtainium-package-name> android.permission.INSTALL_PACKAGES
   ```
   The exact package name is verified at the time of writing the docs via `adb shell pm list packages | grep obtainium` — Obtainium's namespace has shifted across versions, do not pin from memory.
6. **Toggle silent install** — Obtainium → Settings → Installation → "Install silently" → on.
7. **Verify the loop** — Push a trivial change to `main` → approve release → wait up to 1 hour → confirm the new build appears on her phone with no interaction.

### Operational notes (in docs)

- ADB-granted `INSTALL_PACKAGES` **does not survive a factory reset**, and behavior on Obtainium reinstall depends on the Android version. If silent updates ever stop, re-run the `pm grant` command. This is the most likely cause.
- If `pm grant` fails with "Unknown package," Obtainium's package name has changed. Re-verify via `pm list packages | grep obtainium`.
- Other silent-update failure modes (in likelihood order): keystore mismatch (re-signed APK rejected); `versionCode` didn't increment; network blocked.

---

## Section 7 — Concrete code edits

### Deletions

- `ios/` (directory)
- `e2e/` (directory)
- `.detoxrc.js`

### `package.json`

Remove scripts: `ios`, `test:e2e:build`, `test:e2e`.
Add script: `android` (body matches `react-native init` output — verify at scaffold time).
Remove devDependencies: `detox`, `@types/detox`, `@react-native-community/cli-platform-ios`.

**Conditional removal**: `jest-circus`. Jest 27+ uses jest-circus as the default runner, so it may still be required by Jest itself even after Detox is gone (older Detox versions required `testRunner: "jest-circus/runner"` explicitly). At implementation time, check `jest.config.js` and any Detox-leftover config for explicit references. Remove only if no longer referenced and `npm test` passes without it.

### `src/services/NotificationService.ts`

- Replace lines 1–13 (Notifee-vs-rn-push-notification iOS-flavored library justification) with a single-line comment.
- Rewrite JSDoc at lines 27–32 to describe Android 13+ runtime POST_NOTIFICATIONS behavior.
- Drop the `if (Platform.OS === 'android')` wrapper at lines 49–54; call `notifee.createChannel` unconditionally.
- Fix comment at line 101 ("iOS Settings" → "device Settings"). Alert body at line 103 is already platform-neutral.
- Remove `Platform` from imports.

### `src/theme/typography.ts`

```ts
headingFallback: 'sans-serif',
bodyFallback: 'sans-serif',
mono: 'monospace',
```
Remove `Platform` import.

### `src/screens/CreateHabitModal.tsx`

```tsx
behavior="height"
```
(unconditional, line 57). Remove `Platform` import.

### `src/App.tsx`, `src/services/api.ts`, `src/__tests__/services/SyncService.test.ts`

Re-grep at implementation time for `Platform.OS` and `'ios'`. Initial scan found no real branches in these files (matches were comments or unrelated strings). If branches are found, apply the deletion rule: drop the whole conditional block, not "keep the default."

### `README.md`

- Remove Prerequisites table rows: Ruby, Xcode, CocoaPods.
- Add Prerequisites table rows: JDK 17, Android SDK Platform 35, Android Build-Tools 35, Android emulator (or physical device with USB debugging).
- Replace "Getting Started" section: drop steps 3 (pod install) and 4 (run-ios). Replace with Android emulator instructions.
- Remove iOS troubleshooting bullets.
- Update CI section: drop `e2e-tests` row, add `android-build` row. Update branch protection bullets.
- Drop the "React Native iOS app" line in the intro.

### `.github/workflows/ci.yml`

Remove `e2e-tests` job. Add `android-build` and `release` jobs per Section 4. Single workflow file; no separate `release.yml`.

---

## Implementation sequencing (Approach B — incremental PRs)

### PR 0 — Prerequisite: rename repo

- Rename GitHub repo `fitness-app-habits` → `daily-habit-tracker`.
- Update local git remote URL.
- Local working directory path may stay as `fitness-app-habits` or be renamed; git remote is what matters.
- No code changes. Documented here so the canonical URL is right from the start of PR 1.

### PR 1 — Add Android scaffold

- Run RN 0.78 init (incantation verified against current `react-native.dev` docs at execution time).
- Configure `android/app/build.gradle` per Section 2.
- Add manifest permissions per Section 2.
- Wire WatermelonDB native package per Section 2.
- Generate adaptive icon from existing iOS source.
- Verify `./gradlew assembleDebug` works locally and in a new `android-build` CI job (debug signing only at this stage).
- iOS still works; nothing else deleted yet.

### PR 2 — Remove the `e2e-tests` CI job

- Remove the `e2e-tests` job from `.github/workflows/ci.yml`.
- Remove all `macos-latest` runner references from the workflow.
- `android-build` is already present from PR 1; **this PR does not add it**, only removes the iOS Detox job.
- Done before PR 3 so that deleting `e2e/` in the next PR doesn't leave CI red.

### PR 3 — Delete iOS

- Remove `ios/`, `e2e/`, `.detoxrc.js`.
- Drop iOS scripts and iOS-specific devDependencies from `package.json` (and conditionally `jest-circus` — see Section 7).
- Simplify all `Platform.OS === 'ios'` branches per Section 7.
- Update README per Section 7.
- CI stays green because PR 2 already removed the job that referenced this code.

### PR 4 — Set up release signing

- Generate keystore locally; store backups per Section 3.
- Add GitHub repo secrets per Section 3.
- Configure release signing in `android/app/build.gradle`.
- Add `keystore.properties.example`, gitignore the real one.
- Verify `./gradlew assembleRelease` works locally with the real keystore.

### PR 5 — Add release job to CI workflow

- Add `release` job to `.github/workflows/ci.yml` per Section 4, with `needs:` dependency on the four gate jobs.
- Create `production` environment in repo Settings → Environments with required reviewer = self (manual approval gate).
- First release: trigger via `workflow_dispatch`, approve, confirm APK published, confirm `apksigner verify` output shows v2 + v3.

### PR 6 — Phone setup + verification

- Write `docs/android-setup.md` covering one-time phone setup per Section 6.
- Execute the phone setup against the Pixel 10a.
- Verify silent update by pushing a trivial change → approving → confirming silent install on her phone within one hour.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Keystore loss → silent updates die forever | Low | Three-copy storage: GitHub secret + 1Password + external drive |
| ADB grant lost on Obtainium reinstall or factory reset | Medium | Documented in `docs/android-setup.md`; easy to re-grant |
| RN 0.78 init incantation changes between now and execution | Low | Verify against `react-native.dev` docs at scaffold time, not from memory |
| Obtainium package name shifts | Low | Verify via `pm list packages` before pinning into docs |
| Force-push to `main` rewrites history → `git rev-list --count HEAD` regresses | Very low | Single-dev workflow; no protection against intentional force-push, but accidental cases are rare |
| Notifee scheduled triggers lost on first reboot | Mitigated | `RECEIVE_BOOT_COMPLETED` permission included |
| `USE_EXACT_ALARM` rejected by future Android version | Very low | Documented; could fall back to `SCHEDULE_EXACT_ALARM` with settings trip if needed |
| Silent install fails because `versionCode` didn't increase | Mitigated | `git rev-list --count HEAD` guarantees monotonic per-commit increment |

## Verify-at-execution checklist

These are decisions deferred from spec to implementation because they depend on transient state that should be checked against current reality rather than locked in from memory:

- [ ] RN 0.78 init command — confirm against `react-native.dev` docs.
- [ ] `react-native init` output script name (`android: react-native run-android` vs `npx react-native run-android`) — match what's emitted.
- [ ] Notifee `MainApplication.kt` registration syntax — confirm against the current `@notifee/react-native` Android setup docs at PR 1 scaffold time. Registration has shifted across versions.
- [ ] Obtainium package name — `adb shell pm list packages | grep obtainium` before writing the `pm grant` line into docs.
- [ ] Re-grep `src/App.tsx`, `src/services/api.ts`, `src/__tests__/services/SyncService.test.ts` for `Platform.OS` and `'ios'` to confirm no real branches were missed in initial scan.
- [ ] `jest-circus` removal safety — after dropping Detox, run `npm test` without `jest-circus` in `devDependencies` and confirm it still passes (it ships transitively with Jest 27+).
- [ ] `apksigner verify --verbose` output — confirm v2 + v3 present on first CI release build.
