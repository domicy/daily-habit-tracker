# Android-Only Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete iOS support entirely, scaffold Android, and stand up a sideload + Obtainium release pipeline so every merge to `main` (after manual approval) silently installs on the Pixel 10a.

**Architecture:** Seven PRs (PR 0 prerequisite + PR 1–6 implementation), each independently mergeable. PR 1 adds Android while leaving iOS in place; PR 2 unblocks CI; PR 3 removes iOS; PR 4–5 add release signing and the release job; PR 6 sets up the phone. A single `ci.yml` workflow holds both pre-merge gates and the gated release job. The release job depends on all gates via `needs:` and is restricted to `main` via `if:`.

**Tech Stack:** React Native 0.78, TypeScript, WatermelonDB, Notifee, Gradle (Android), GitHub Actions (Ubuntu runners only), Obtainium (on-device installer), Python/FastAPI backend (unchanged).

**Spec:** `docs/superpowers/specs/2026-05-12-android-only-pivot-design.md`

---

## File Structure

| Path | Action | Owning PR | Responsibility |
|---|---|---|---|
| `android/` | Create | PR 1 | Android native project; build.gradle, manifest, MainApplication.kt, signing config, adaptive icon |
| `android/keystore.properties.example` | Create | PR 4 | Template documenting the four keys CI/local builds read |
| `.gitignore` | Modify | PR 4 | Add `android/keystore.properties`, `android/release.keystore`, `android/app/release.keystore` |
| `.github/workflows/ci.yml` | Modify | PR 1, 2, 3, 5 | Single workflow holding gate jobs + release job |
| `package.json` | Modify | PR 1, 3 | Add `android` script; remove iOS scripts/deps |
| `src/services/NotificationService.ts` | Modify | PR 3 | Drop iOS-only comments and `Platform.OS === 'android'` gate |
| `src/theme/typography.ts` | Modify | PR 3 | Drop Platform.OS ternaries |
| `src/screens/CreateHabitModal.tsx` | Modify | PR 3 | Drop Platform.OS ternary for KeyboardAvoidingView behavior |
| `README.md` | Modify | PR 3 | Remove iOS prerequisites/instructions; add Android equivalents |
| `ios/` | Delete | PR 3 | Native iOS project — gone |
| `e2e/` | Delete | PR 3 | Detox tests — all iOS-only |
| `.detoxrc.js` | Delete | PR 3 | Detox config — no longer needed |
| `docs/android-setup.md` | Create | PR 6 | One-time phone setup, ADB grant, troubleshooting |

---

## PR 0: Repo rename (prerequisite — no code)

### Task 0.1: Rename GitHub repo

**Files:** None (GitHub UI + local git remote).

- [ ] **Step 1: Rename in GitHub UI**

  Go to `https://github.com/<owner>/fitness-app-habits/settings` → "Repository name" → change to `daily-habit-tracker` → "Rename".

- [ ] **Step 2: Update local git remote**

  ```bash
  git remote set-url origin git@github.com:<owner>/daily-habit-tracker.git
  git remote -v
  ```

  Expected: both `fetch` and `push` URLs show `daily-habit-tracker.git`.

- [ ] **Step 3: Verify push works**

  ```bash
  git fetch origin
  ```

  Expected: succeeds, no errors.

- [ ] **Step 4: (Optional) rename local working directory**

  The local path `/srv/git/home/fitness-app-habits` continues to work as-is. If you want to rename the directory:

  ```bash
  cd /srv/git/home && mv fitness-app-habits daily-habit-tracker && cd daily-habit-tracker
  ```

  Skip this if you don't care.

  *No commit; nothing in the repo changed.*

---

## PR 1: Add Android scaffold

**Branch:** `pivot/01-android-scaffold`

### Task 1.1: Confirm RN 0.78 init command against current docs

**Files:** None (verification only).

- [ ] **Step 1: Check React Native docs for the current init incantation**

  Visit `https://reactnative.dev/docs/0.78/_getting-started-without-a-framework` (or whatever the current canonical URL is for the React Native CLI without Expo). Record the exact command, e.g.:

  ```
  npx @react-native-community/cli@latest init <Name>
  ```

  Note any new required flags. The historical `--template react-native-template-typescript` flag is dead as of RN 0.71; TypeScript is the default.

- [ ] **Step 2: Record the verified command**

  Write the verified command in a scratch note for use in Task 1.2. Do not commit.

### Task 1.2: Scaffold a fresh RN 0.78 project in a temp directory

**Files:** Generate native projects in a sandboxed directory; only `android/` will be copied into the repo.

- [ ] **Step 1: Create temp workspace**

  ```bash
  mkdir -p /tmp/rn-scaffold && cd /tmp/rn-scaffold
  ```

- [ ] **Step 2: Run the verified init command**

  Substitute the command verified in Task 1.1. Example:

  ```bash
  npx @react-native-community/cli@latest init DailyHabitTracker --version 0.78
  ```

  Expected: a `DailyHabitTracker/` directory is created containing `android/`, `ios/`, `App.tsx`, `package.json`, etc.

- [ ] **Step 3: Verify `android/` was generated**

  ```bash
  ls /tmp/rn-scaffold/DailyHabitTracker/android/app/src/main/AndroidManifest.xml
  ```

  Expected: file exists.

  *No commit; scratch work in `/tmp`.*

### Task 1.3: Copy `android/` into the repo

**Files:**
- Create: `android/` (entire directory tree from scaffold)

- [ ] **Step 1: Copy android directory to repo root**

  From the repo root:

  ```bash
  cp -R /tmp/rn-scaffold/DailyHabitTracker/android ./android
  ```

- [ ] **Step 2: Verify copy succeeded**

  ```bash
  ls android/app/build.gradle android/build.gradle android/settings.gradle android/gradle/wrapper/gradle-wrapper.jar
  ```

  Expected: all four files exist.

- [ ] **Step 3: Stage and commit the raw scaffold**

  ```bash
  git add android/
  git commit -m "Add Android native scaffold (unmodified RN 0.78 output)"
  ```

  *Commit the raw scaffold separately so subsequent edits show clean diffs.*

### Task 1.4: Set `applicationId`, SDK versions, version env reads in `android/app/build.gradle`

**Files:**
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Locate the `defaultConfig` block**

  Open `android/app/build.gradle`. Find the `android { ... defaultConfig { ... } }` block.

- [ ] **Step 2: Set `applicationId` to `com.darling.dailyhabittracker`**

  Inside `defaultConfig`, set:

  ```groovy
  applicationId "com.darling.dailyhabittracker"
  ```

  If the scaffold generated a placeholder (e.g., `com.dailyhabittracker`), replace it.

- [ ] **Step 3: Confirm SDK versions are 24/35/35**

  Inside `defaultConfig`:

  ```groovy
  minSdkVersion 24
  targetSdkVersion 35
  ```

  Inside `android { ... }`:

  ```groovy
  compileSdkVersion 35
  ```

  RN 0.78 defaults are typically correct; verify and adjust if not.

- [ ] **Step 4: Replace static `versionCode`/`versionName` with env reads**

  Inside `defaultConfig`, replace the existing version lines with:

  ```groovy
  versionCode (System.getenv("VERSION_CODE") ?: "1") as Integer
  versionName System.getenv("VERSION_NAME") ?: "dev"
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add android/app/build.gradle
  git commit -m "Configure applicationId, SDK versions, env-driven version"
  ```

### Task 1.5: Add signing config with debug fallback in `android/app/build.gradle`

**Files:**
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Replace `signingConfigs.release` block**

  Inside `android { signingConfigs { ... } }`, replace any existing `release` config with:

  ```groovy
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
  ```

- [ ] **Step 2: Update `buildTypes.release` to conditionally pick the signing config**

  Inside `android { buildTypes { release { ... } } }`, set:

  ```groovy
  signingConfig rootProject.file('keystore.properties').exists() ? signingConfigs.release : signingConfigs.debug
  ```

  Leave the other release flags (`minifyEnabled`, `proguardFiles`) at scaffold defaults.

- [ ] **Step 3: Commit**

  ```bash
  git add android/app/build.gradle
  git commit -m "Add Gradle release signing with debug fallback"
  ```

### Task 1.6: Add Android manifest permissions

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Open the manifest**

  Open `android/app/src/main/AndroidManifest.xml`. The scaffold ships with `INTERNET` and `SYSTEM_ALERT_WINDOW` (the latter only in debug variant typically).

- [ ] **Step 2: Replace permissions block**

  Just inside `<manifest ...>` and before `<application ...>`, ensure these five permissions are present (add what's missing; keep `INTERNET` if already there):

  ```xml
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <uses-permission android:name="android.permission.VIBRATE" />
  ```

  Do **not** add `SCHEDULE_EXACT_ALARM` — `USE_EXACT_ALARM` is the one we want.

- [ ] **Step 3: Commit**

  ```bash
  git add android/app/src/main/AndroidManifest.xml
  git commit -m "Add Android permissions: POST_NOTIFICATIONS, USE_EXACT_ALARM, RECEIVE_BOOT_COMPLETED, VIBRATE"
  ```

### Task 1.7: Wire WatermelonDB native package

**Files:**
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/java/com/darling/dailyhabittracker/MainApplication.kt` (path may differ — see step 1)

- [ ] **Step 1: Locate `MainApplication.kt`**

  ```bash
  find android/app/src/main/java -name MainApplication.kt
  ```

  Expected: a single file under a path matching the applicationId (e.g., `android/app/src/main/java/com/darling/dailyhabittracker/MainApplication.kt`).

- [ ] **Step 2: Apply WatermelonDB Gradle script**

  At the bottom of `android/app/build.gradle`, add:

  ```groovy
  apply from: '../../node_modules/@nozbe/watermelondb/native/android-jsi/build.gradle'
  ```

- [ ] **Step 3: Register the package in `MainApplication.kt`**

  Inside the `MainApplication.kt` `getPackages()` override (which by default returns the autolinked list), append the WatermelonDB JSI package. The current `@nozbe/watermelondb` README shows the exact import + add line — verify against `node_modules/@nozbe/watermelondb/README.md` since the line has shifted across versions. Common form:

  ```kotlin
  import com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage
  // ...
  override fun getPackages(): List<ReactPackage> {
      val packages = PackageList(this).packages
      packages.add(WatermelonDBJSIPackage())
      return packages
  }
  ```

  If the README dictates a different import path or registration form for the version installed, use that instead.

- [ ] **Step 4: Commit**

  ```bash
  git add android/app/build.gradle android/app/src/main/java
  git commit -m "Wire WatermelonDB JSI package for Android"
  ```

### Task 1.8: Verify Notifee MainApplication registration

**Files:**
- Possibly modify: `android/app/src/main/java/com/darling/dailyhabittracker/MainApplication.kt`

- [ ] **Step 1: Check Notifee Android setup docs**

  Read `node_modules/@notifee/react-native/README.md` (or its `android-setup.md` if present). Notifee's `MainApplication.kt` registration syntax has shifted across versions — confirm what the installed version expects.

- [ ] **Step 2: Apply registration if required**

  Many Notifee versions are fully autolinked and require nothing extra. If the README says to add a package registration manually, do so following the README's exact form. If autolinking is sufficient, no change.

- [ ] **Step 3: Commit (only if files changed)**

  ```bash
  git add android/app/src/main/java
  git commit -m "Wire Notifee package for Android per README"
  ```

  Skip if no changes were needed.

### Task 1.9: Generate Android adaptive icon

**Files:**
- Create: `android/app/src/main/res/mipmap-*/ic_launcher.png`
- Create: `android/app/src/main/res/mipmap-*/ic_launcher_round.png`
- Create: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- Create: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- Create: `android/app/src/main/res/drawable/ic_launcher_foreground.xml` (or PNG)
- Create: `android/app/src/main/res/values/ic_launcher_background.xml`

- [ ] **Step 1: Locate the iOS app icon source**

  ```bash
  find ios -name '*.png' -path '*AppIcon*' | head
  ```

  Expected: paths under `ios/DailyHabitTracker/Images.xcassets/AppIcon.appiconset/` or similar. Identify the largest (typically `1024x1024.png`).

- [ ] **Step 2: Generate adaptive icon assets**

  Use Android Studio's Image Asset Studio (Right-click `app/res` → New → Image Asset) or the command-line tool `android-asset-studio-cli` (npm package). With Android Studio:
  1. Choose icon type: Launcher Icons (Adaptive and Legacy).
  2. Foreground layer: import the iOS icon PNG, set padding to ~25% so it doesn't get cropped.
  3. Background layer: solid color matching the iOS icon background (or a derived color).
  4. Generate. This populates all `mipmap-*` directories + the `ic_launcher_foreground` drawable + the `ic_launcher_background` color.

- [ ] **Step 3: Verify icon assets are present**

  ```bash
  ls android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
  ls android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
  ```

  Expected: both exist.

- [ ] **Step 4: Commit**

  ```bash
  git add android/app/src/main/res
  git commit -m "Generate Android adaptive icon from iOS source"
  ```

### Task 1.10: Add `android` script to `package.json`

**Files:**
- Modify: `package.json:5-13` (`scripts` block)

- [ ] **Step 1: Read what `react-native init` puts in its own `package.json`**

  ```bash
  grep '"android"' /tmp/rn-scaffold/DailyHabitTracker/package.json
  ```

  Record the exact body (likely `react-native run-android` or `npx react-native run-android`).

- [ ] **Step 2: Add the script**

  Edit the repo's `package.json`, add to the `scripts` object (alongside existing entries):

  ```json
  "android": "<exact body from step 1>",
  ```

  Do **not** touch the existing `ios` script in this PR — that's PR 3's job.

- [ ] **Step 3: Commit**

  ```bash
  git add package.json
  git commit -m "Add npm android script"
  ```

### Task 1.11: Verify local Android debug build

**Files:** None (verification).

- [ ] **Step 1: Ensure JDK 17 and Android SDK 35 are installed**

  ```bash
  java -version
  ```

  Expected: JDK 17.x.

  Check `$ANDROID_HOME` is set and `platforms/android-35`, `build-tools/35.*` are present:

  ```bash
  ls $ANDROID_HOME/platforms/ $ANDROID_HOME/build-tools/
  ```

  If missing, install via Android Studio SDK Manager.

- [ ] **Step 2: Install npm deps if needed**

  ```bash
  npm ci
  ```

- [ ] **Step 3: Run the debug build**

  ```bash
  cd android && ./gradlew assembleDebug && cd ..
  ```

  Expected: `BUILD SUCCESSFUL`. APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

  If it fails, common causes (in order): missing `local.properties` pointing at `$ANDROID_HOME`; Notifee/WatermelonDB native step not done correctly; wrong JDK.

- [ ] **Step 4: No commit** — verification only.

### Task 1.12: Add `android-build` job to `.github/workflows/ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read the existing `ci.yml` to identify where to insert**

  Open `.github/workflows/ci.yml`. Locate the `jobs:` map.

- [ ] **Step 2: Restrict the `push:` trigger to `main`**

  At the top under `on:`, if the trigger is currently bare `push:`, change to:

  ```yaml
  on:
    push:
      branches: [main]
    pull_request:
    workflow_dispatch:
  ```

  (`workflow_dispatch` may already be present from prior PRs — add only if missing.)

- [ ] **Step 3: Add the `android-build` job**

  Append to `jobs:`:

  ```yaml
    android-build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20' }
        - uses: actions/setup-java@v4
          with: { distribution: 'temurin', java-version: '17' }
        - run: npm ci
        - run: cd android && ./gradlew assembleRelease
  ```

  Note: `assembleRelease` runs with debug-signing fallback because `keystore.properties` is absent in CI at this stage. That's by design — gate verification only.

- [ ] **Step 4: Commit**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "Add android-build gate job; restrict push trigger to main"
  ```

### Task 1.13: Open PR 1 and verify CI

**Files:** None.

- [ ] **Step 1: Push branch**

  ```bash
  git push -u origin pivot/01-android-scaffold
  ```

- [ ] **Step 2: Open PR**

  ```bash
  gh pr create --title "PR 1: Add Android native scaffold" --body "Adds android/ directory, manifest permissions, signing config with debug fallback, native WatermelonDB/Notifee wiring, adaptive icon, npm android script, and an android-build CI gate. iOS still works."
  ```

- [ ] **Step 3: Wait for CI**

  Expected: `lint-and-typecheck`, `unit-tests`, `backend-tests`, and the new `android-build` job all green. `e2e-tests` still runs (will be removed in PR 2); may pass or fail as before — not a blocker for merge if it was already passing.

- [ ] **Step 4: Merge**

  ```bash
  gh pr merge --squash --delete-branch
  ```

---

## PR 2: Remove `e2e-tests` CI job

**Branch:** `pivot/02-remove-e2e-job`

### Task 2.1: Remove `e2e-tests` job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Delete the `e2e-tests` job block**

  Open `.github/workflows/ci.yml`. Delete the entire `e2e-tests:` job key and its contents. Also remove any `macos-latest` runner references that exist solely for that job.

- [ ] **Step 2: Verify no other job depends on `e2e-tests`**

  ```bash
  grep -n "e2e-tests" .github/workflows/ci.yml
  ```

  Expected: no matches.

- [ ] **Step 3: Commit**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "Remove e2e-tests CI job (iOS-only Detox, replaced by android-build gate)"
  ```

### Task 2.2: Open PR 2 and merge

- [ ] **Step 1: Push**

  ```bash
  git push -u origin pivot/02-remove-e2e-job
  ```

- [ ] **Step 2: Open PR and verify CI**

  ```bash
  gh pr create --title "PR 2: Remove e2e-tests CI job" --body "Removes the iOS-only Detox job. Done before PR 3 deletes ios/e2e/.detoxrc.js so CI never sees a job referencing deleted code."
  ```

  Expected: all remaining jobs green.

- [ ] **Step 3: Merge**

  ```bash
  gh pr merge --squash --delete-branch
  ```

---

## PR 3: Delete iOS

**Branch:** `pivot/03-delete-ios`

### Task 3.1: Delete iOS directories and Detox config

**Files:**
- Delete: `ios/`
- Delete: `e2e/`
- Delete: `.detoxrc.js`

- [ ] **Step 1: Confirm iOS app icon already extracted**

  PR 1's adaptive icon should already be in place. If you want extra insurance, copy the iOS icon PNGs to a safe location outside the repo before deletion:

  ```bash
  cp -R ios/DailyHabitTracker/Images.xcassets /tmp/ios-icon-backup
  ```

- [ ] **Step 2: Delete**

  ```bash
  git rm -r ios e2e .detoxrc.js
  ```

- [ ] **Step 3: Verify deletion**

  ```bash
  ls ios e2e .detoxrc.js 2>&1 | grep -i 'no such'
  ```

  Expected: three "No such file or directory" lines (one per path).

- [ ] **Step 4: Commit**

  ```bash
  git commit -m "Delete iOS native project, Detox config, and E2E tests"
  ```

### Task 3.2: Remove iOS scripts and devDependencies from `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove iOS scripts**

  Edit `package.json`. Delete these `scripts` entries: `ios`, `test:e2e:build`, `test:e2e`.

- [ ] **Step 2: Remove iOS-only devDependencies**

  Delete from `devDependencies`: `detox`, `@types/detox`, `@react-native-community/cli-platform-ios`.

  Do **not** remove `jest-circus` in this step (Task 3.3 handles it conditionally).

- [ ] **Step 3: Reinstall to update lockfile**

  ```bash
  npm install
  ```

  Expected: no errors; `package-lock.json` is updated.

- [ ] **Step 4: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "Remove iOS scripts and Detox/CLI-iOS devDependencies"
  ```

### Task 3.3: Conditionally remove `jest-circus`

**Files:**
- Possibly modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Grep for explicit references**

  ```bash
  grep -rn "jest-circus" jest.config.js package.json src/ 2>/dev/null
  ```

  Expected: no matches (Jest 27+ uses jest-circus as default runner without explicit config). If you find a reference (e.g., a `testRunner: "jest-circus/runner"` line left over from old Detox), record it — that means jest-circus is not freely removable until you also delete that config.

- [ ] **Step 2: Tentatively remove `jest-circus` from `devDependencies`**

  Edit `package.json`. Remove the `jest-circus` line from `devDependencies`. Then:

  ```bash
  npm install
  ```

- [ ] **Step 3: Run unit tests**

  ```bash
  npm test
  ```

  Expected: PASS — Jest 27+ pulls jest-circus transitively. If FAIL with errors about the test runner, restore `jest-circus` to `devDependencies` and reinstall:

  ```bash
  git checkout package.json package-lock.json
  npm install
  ```

  Then skip the rest of this task.

- [ ] **Step 4: Commit (only if removal succeeded)**

  ```bash
  git add package.json package-lock.json
  git commit -m "Remove jest-circus from devDependencies (Jest 27+ uses it transitively)"
  ```

### Task 3.4: Simplify `src/services/NotificationService.ts`

**Files:**
- Modify: `src/services/NotificationService.ts`

- [ ] **Step 1: Replace the header comment block (lines 1–13)**

  Lines 1–13 contain a library-justification comment that is iOS-flavored. Replace the entire block with a single-line comment:

  ```ts
  // NotificationService: scheduled daily habit reminders via @notifee/react-native.
  ```

- [ ] **Step 2: Rewrite the `requestPermission` JSDoc (lines 27–32)**

  Replace with:

  ```ts
  /**
   * Request notification permission.
   * On Android 13+ this maps to the runtime POST_NOTIFICATIONS prompt.
   * On older Android this is a no-op (granted at install).
   */
  ```

- [ ] **Step 3: Drop the `if (Platform.OS === 'android')` gate around channel creation**

  Replace lines 48–54:

  ```ts
  // before
  // Ensure Android notification channel exists (no-op on iOS)
  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Daily Reminders',
    });
  }
  ```

  with:

  ```ts
  // Ensure notification channel exists.
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Daily Reminders',
  });
  ```

- [ ] **Step 4: Fix the "iOS Settings" comment at line 101**

  Replace:

  ```ts
  // User previously denied — direct them to iOS Settings
  ```

  with:

  ```ts
  // User previously denied — direct them to device Settings
  ```

  The alert body at line 103 is already platform-neutral; no change needed.

- [ ] **Step 5: Remove `Platform` from imports**

  At line 21, change:

  ```ts
  import {Alert, Platform} from 'react-native';
  ```

  to:

  ```ts
  import {Alert} from 'react-native';
  ```

- [ ] **Step 6: Run unit tests for this file**

  ```bash
  npm test -- --testPathPattern=NotificationService
  ```

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add src/services/NotificationService.ts
  git commit -m "Simplify NotificationService — Android-only"
  ```

### Task 3.5: Simplify `src/theme/typography.ts`

**Files:**
- Modify: `src/theme/typography.ts`

- [ ] **Step 1: Replace `Platform.OS` ternaries with Android-only values**

  Replace lines 5–8:

  ```ts
  headingFallback: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  body: 'Biotif-Regular',
  bodyFallback: Platform.OS === 'ios' ? 'San Francisco' : 'sans-serif',
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  ```

  with:

  ```ts
  headingFallback: 'sans-serif',
  body: 'Biotif-Regular',
  bodyFallback: 'sans-serif',
  mono: 'monospace',
  ```

- [ ] **Step 2: Remove the `Platform` import**

  At the top of the file, delete the `import { Platform } from 'react-native';` line.

- [ ] **Step 3: Commit**

  ```bash
  git add src/theme/typography.ts
  git commit -m "Simplify typography — Android-only font fallbacks"
  ```

### Task 3.6: Simplify `src/screens/CreateHabitModal.tsx`

**Files:**
- Modify: `src/screens/CreateHabitModal.tsx`

- [ ] **Step 1: Replace the `behavior` prop ternary**

  At line 57:

  ```tsx
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  ```

  becomes:

  ```tsx
  behavior="height"
  ```

- [ ] **Step 2: Remove the `Platform` import if no longer used**

  ```bash
  grep -n "Platform" src/screens/CreateHabitModal.tsx
  ```

  Expected: only the import line remains. Delete the import.

- [ ] **Step 3: Commit**

  ```bash
  git add src/screens/CreateHabitModal.tsx
  git commit -m "Simplify CreateHabitModal — height behavior unconditional"
  ```

### Task 3.7: Re-grep remaining files for `Platform.OS` and `'ios'`

**Files:** None (verification + targeted edits if found).

- [ ] **Step 1: Scan the listed files cleanly**

  ```bash
  for f in src/App.tsx src/services/api.ts src/__tests__/services/SyncService.test.ts; do
    echo "=== $f ==="
    grep -n "Platform\.OS\|'ios'" "$f" 2>/dev/null
  done
  ```

  Expected: either no output, or only matches inside comments / unrelated strings.

- [ ] **Step 2: For each real branch found, apply the deletion rule**

  If a line like `if (Platform.OS === 'ios') { … }` exists with **no else**, delete the entire conditional block (not "keep the default" — there is no default).

  If a ternary like `Platform.OS === 'ios' ? A : B` exists, replace with `B`.

  Also remove the `Platform` import if it becomes unused.

- [ ] **Step 3: Scan all of `src/` one more time**

  ```bash
  grep -rn "Platform\.OS" src/
  ```

  Expected: no matches.

- [ ] **Step 4: Commit (only if any edits were made)**

  ```bash
  git add src/
  git commit -m "Drop remaining Platform.OS branches"
  ```

  Skip if no edits were needed.

### Task 3.8: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the intro line**

  Change:

  ```
  A React Native iOS app for building and tracking daily habits. Built with the React Native CLI (no Expo) for full native module access.
  ```

  to:

  ```
  A React Native Android app for building and tracking daily habits. Built with the React Native CLI (no Expo) for full native module access. Distributed via sideloaded APK + Obtainium auto-updates.
  ```

- [ ] **Step 2: Replace the Prerequisites table**

  Replace the existing table with:

  ```markdown
  | Tool             | Version   | Notes                                      |
  |------------------|-----------|--------------------------------------------|
  | Node.js          | >= 20     | LTS recommended                            |
  | JDK              | 17        | Temurin or any OpenJDK 17 build            |
  | Android SDK      | Platform 35, Build-Tools 35.x | Install via Android Studio SDK Manager |
  | Android emulator | API 34+   | Or a physical device with USB debugging on |
  | Watchman         | latest    | `brew install watchman` (recommended)      |
  ```

- [ ] **Step 3: Replace the Getting Started section**

  Replace steps 3 (iOS pods) and 4 (run-ios) with:

  ```markdown
  ### 3. Run on Android emulator

  Start an emulator from Android Studio (Device Manager), then:

  ```bash
  npm run android
  ```

  To target a specific device:

  ```bash
  npx react-native run-android --device <id>
  ```
  ```

- [ ] **Step 4: Replace the Available Scripts table row**

  Change `npm run ios` line to `npm run android`. Drop any E2E test rows.

- [ ] **Step 5: Drop the entire iOS troubleshooting block**

  Delete the "Pod install fails" and "Build fails in Xcode" bullets at the bottom.

- [ ] **Step 6: Update the CI section**

  Drop the `e2e-tests` row from the CI Jobs table. Add an `android-build` row:

  ```markdown
  | `android-build`      | Push/PR to `main`               | `ubuntu-latest`| Runs `./gradlew assembleRelease` with debug-signing fallback for build verification |
  ```

  Drop the bullet about `e2e-tests` not being required (it's gone entirely now).

- [ ] **Step 7: Commit**

  ```bash
  git add README.md
  git commit -m "Update README: Android-only setup, prerequisites, scripts, CI"
  ```

### Task 3.9: Run the full test suite

**Files:** None.

- [ ] **Step 1: Run all tests + typecheck + lint**

  ```bash
  npm run lint && npm run typecheck && npm test
  ```

  Expected: all three pass.

- [ ] **Step 2: If anything fails, fix it before opening the PR**

  Common failures: a stale `Platform` import, an unused-variable lint error, a test that mocked iOS-specific behavior. Fix and re-run.

  *No commit if no fixes were needed.*

### Task 3.10: Open PR 3 and merge

- [ ] **Step 1: Push**

  ```bash
  git push -u origin pivot/03-delete-ios
  ```

- [ ] **Step 2: Open PR**

  ```bash
  gh pr create --title "PR 3: Delete iOS" --body "Removes ios/, e2e/, .detoxrc.js, iOS scripts, iOS devDependencies, Platform.OS branches, and iOS sections of the README. App is Android-only after this PR."
  ```

- [ ] **Step 3: Wait for CI**

  Expected: `lint-and-typecheck`, `unit-tests`, `backend-tests`, `android-build` all green.

- [ ] **Step 4: Merge**

  ```bash
  gh pr merge --squash --delete-branch
  ```

---

## PR 4: Set up release signing

**Branch:** `pivot/04-release-signing`

### Task 4.1: Generate release keystore locally

**Files:** None in repo (keystore is gitignored).

- [ ] **Step 1: Generate the keystore**

  In a working directory **outside the repo** (e.g., `~/keystores/`):

  ```bash
  mkdir -p ~/keystores && cd ~/keystores
  keytool -genkeypair -v \
    -keystore release.keystore \
    -alias dailyhabittracker \
    -keyalg RSA -keysize 2048 -validity 10000
  ```

  Provide a strong keystore password (record in 1Password). For "first and last name," etc., use truthful values; for "key password," press Enter to reuse the keystore password (simpler).

  Expected: `~/keystores/release.keystore` exists.

- [ ] **Step 2: Verify the keystore contents**

  ```bash
  keytool -list -v -keystore ~/keystores/release.keystore -alias dailyhabittracker
  ```

  Provide the password. Expected: certificate fingerprints printed.

### Task 4.2: Back up the keystore

**Files:** None.

- [ ] **Step 1: Add to 1Password**

  Create a new 1Password item titled "DailyHabitTracker Android Keystore." Attach `~/keystores/release.keystore`. Add password fields: `storePassword`, `keyAlias=dailyhabittracker`, `keyPassword`.

- [ ] **Step 2: Copy to an offline drive**

  Plug in an external drive (or any non-cloud-synced backup). Copy:

  ```bash
  cp ~/keystores/release.keystore <path-to-external-drive>/release.keystore
  ```

  Verify both copies have identical SHA256:

  ```bash
  shasum -a 256 ~/keystores/release.keystore <path-to-external-drive>/release.keystore
  ```

  Expected: both hashes match.

### Task 4.3: Add GitHub Actions secrets

**Files:** None.

- [ ] **Step 1: Base64-encode the keystore**

  ```bash
  base64 -w 0 ~/keystores/release.keystore > /tmp/keystore.b64
  ```

  (`-w 0` disables line wrapping. On macOS use `base64 -i ~/keystores/release.keystore -o /tmp/keystore.b64`.)

- [ ] **Step 2: Add the four secrets via `gh`**

  ```bash
  gh secret set ANDROID_KEYSTORE_BASE64 < /tmp/keystore.b64
  gh secret set ANDROID_KEYSTORE_PASSWORD --body '<your store password>'
  gh secret set ANDROID_KEY_ALIAS --body 'dailyhabittracker'
  gh secret set ANDROID_KEY_PASSWORD --body '<your key password>'
  ```

- [ ] **Step 3: Securely delete the temp file**

  ```bash
  shred -u /tmp/keystore.b64  # Linux
  # or: rm -P /tmp/keystore.b64  # macOS
  ```

- [ ] **Step 4: Verify secrets exist**

  ```bash
  gh secret list
  ```

  Expected: four `ANDROID_*` entries.

### Task 4.4: Add `keystore.properties.example`

**Files:**
- Create: `android/keystore.properties.example`

- [ ] **Step 1: Write the example file**

  Content:

  ```
  # Template for android/keystore.properties (gitignored).
  # CI generates the real file from secrets at build time.
  # For local release builds, copy this to keystore.properties and fill in real values.
  storeFile=release.keystore
  storePassword=<your store password>
  keyAlias=dailyhabittracker
  keyPassword=<your key password>
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add android/keystore.properties.example
  git commit -m "Add keystore.properties.example template"
  ```

### Task 4.5: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append Android keystore patterns**

  Open `.gitignore` and add (if not already present):

  ```
  # Android signing
  android/keystore.properties
  android/release.keystore
  android/app/release.keystore
  ```

- [ ] **Step 2: Verify nothing sensitive is currently tracked**

  ```bash
  git ls-files | grep -E 'keystore\.properties$|release\.keystore$'
  ```

  Expected: no output. If anything is listed, remove it from git first:

  ```bash
  git rm --cached <path>
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add .gitignore
  git commit -m "Gitignore Android keystore and properties"
  ```

### Task 4.6: Verify a real release build locally

**Files:** None (verification).

- [ ] **Step 1: Copy keystore into the Android project**

  ```bash
  cp ~/keystores/release.keystore android/release.keystore
  cp android/keystore.properties.example android/keystore.properties
  ```

  Edit `android/keystore.properties` and fill in the real password values.

- [ ] **Step 2: Run release build with version envs**

  ```bash
  cd android && VERSION_CODE=$(git rev-list --count HEAD) VERSION_NAME="v0.0.1-r$(git rev-list --count HEAD)" ./gradlew assembleRelease && cd ..
  ```

  Expected: `BUILD SUCCESSFUL`. APK at `android/app/build/outputs/apk/release/app-release.apk`.

- [ ] **Step 3: Verify the signature scheme**

  Locate `apksigner` (ships with Android Build-Tools):

  ```bash
  $ANDROID_HOME/build-tools/35.0.0/apksigner verify --verbose android/app/build/outputs/apk/release/app-release.apk
  ```

  Expected output includes:

  ```
  Verified using v2 scheme (APK Signature Scheme v2): true
  Verified using v3 scheme (APK Signature Scheme v3): true
  ```

  If v2 is `false`, signing is misconfigured.

- [ ] **Step 4: Clean up local secrets**

  ```bash
  rm android/release.keystore android/keystore.properties
  ```

  Both are gitignored but removing them locally avoids accidents.

  *No commit; verification only.*

### Task 4.7: Open PR 4 and merge

- [ ] **Step 1: Push**

  ```bash
  git push -u origin pivot/04-release-signing
  ```

- [ ] **Step 2: Open PR**

  ```bash
  gh pr create --title "PR 4: Set up Android release signing" --body "Adds keystore.properties.example, gitignores keystore artifacts. Keystore generated and stored locally (1Password + external drive + GitHub secrets); not in this PR's diff. Release builds verified locally with apksigner v2 + v3 confirmed."
  ```

- [ ] **Step 3: Wait for CI and merge**

  Expected: all gates pass. `android-build` continues to use debug-signing fallback because `keystore.properties` is not present in the PR branch.

  ```bash
  gh pr merge --squash --delete-branch
  ```

---

## PR 5: Add release job

**Branch:** `pivot/05-release-job`

### Task 5.1: Add the `release` job to `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append the release job**

  At the end of the `jobs:` map, add:

  ```yaml
    release:
      needs: [lint-and-typecheck, unit-tests, backend-tests, android-build]
      if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
      runs-on: ubuntu-latest
      environment: production
      permissions:
        contents: write
      steps:
        - uses: actions/checkout@v4
          with:
            fetch-depth: 0
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
          run: $ANDROID_HOME/build-tools/35.0.0/apksigner verify --verbose android/app/build/outputs/apk/release/app-release.apk
        - name: Publish release
          env:
            GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          run: |
            gh release create "${{ steps.version.outputs.version_name }}" \
              android/app/build/outputs/apk/release/app-release.apk \
              --generate-notes \
              --target ${{ github.sha }}
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "Add gated release job: build, sign, verify, publish APK"
  ```

### Task 5.2: Create the `production` environment in GitHub

**Files:** None.

- [ ] **Step 1: Open repo settings → Environments**

  Visit `https://github.com/<owner>/daily-habit-tracker/settings/environments`.

- [ ] **Step 2: Create environment**

  Click "New environment" → name: `production` → "Configure environment."

- [ ] **Step 3: Add required reviewers**

  Under "Required reviewers," add yourself. Save.

  This is what makes the release job wait for manual approval.

### Task 5.3: Open PR 5

- [ ] **Step 1: Push and open PR**

  ```bash
  git push -u origin pivot/05-release-job
  gh pr create --title "PR 5: Add gated release job to CI" --body "Release job runs only on push to main (or workflow_dispatch from main), only after all four gate jobs pass, only after manual approval in the production environment. Signs with the real keystore decoded from GitHub secrets and publishes a GitHub Release with the APK attached."
  ```

- [ ] **Step 2: Verify CI**

  Expected: all gate jobs green. The `release` job is skipped on the PR (the `if:` requires `main`).

- [ ] **Step 3: Merge**

  ```bash
  gh pr merge --squash --delete-branch
  ```

### Task 5.4: Trigger first release via `workflow_dispatch`

**Files:** None.

- [ ] **Step 1: Dispatch the workflow on main**

  ```bash
  gh workflow run ci.yml --ref main
  ```

  This triggers gates + the release job (since `main` + dispatch satisfies the `if:`).

- [ ] **Step 2: Watch the run**

  ```bash
  gh run watch
  ```

  Expected sequence: gates run → release job pauses with "Waiting for review."

- [ ] **Step 3: Approve in the GitHub UI**

  Open the run in the browser, click "Review deployments," select `production`, approve.

- [ ] **Step 4: Wait for completion**

  ```bash
  gh run watch
  ```

  Expected: release job goes green; a new GitHub Release appears.

- [ ] **Step 5: Verify the published release**

  ```bash
  gh release list
  gh release view <tag>
  ```

  Expected: one release tagged `v0.0.1-r<count>`, with `app-release.apk` attached.

- [ ] **Step 6: Download and verify signature**

  ```bash
  gh release download <tag>
  $ANDROID_HOME/build-tools/35.0.0/apksigner verify --verbose app-release.apk
  ```

  Expected: `Verified using v2 scheme: true`, `Verified using v3 scheme: true`.

  *No commit; verification only.*

---

## PR 6: Phone setup + final verification

**Branch:** `pivot/06-phone-setup-docs`

### Task 6.1: Verify Obtainium package name

**Files:** None (data-gathering for Task 6.2).

- [ ] **Step 1: Install Obtainium on the Pixel 10a (if not already installed)**

  On the phone: open browser, go to `https://github.com/ImranR98/Obtainium/releases`, download the latest APK, install. May need to enable "Install unknown apps" for the browser first.

- [ ] **Step 2: Enable USB debugging**

  Phone Settings → About phone → tap Build Number 7 times to enable Developer Options. Developer Options → enable "USB debugging." Plug into the laptop. Accept the RSA prompt.

- [ ] **Step 3: Find the exact Obtainium package name**

  ```bash
  adb shell pm list packages | grep -i obtainium
  ```

  Record the exact package name (e.g., `dev.imranr.obtainium.app` — but verify; do not assume).

### Task 6.2: Write `docs/android-setup.md`

**Files:**
- Create: `docs/android-setup.md`

- [ ] **Step 1: Write the doc using the verified Obtainium package name from Task 6.1**

  Content:

  ```markdown
  # Android Setup — Sideload + Obtainium

  One-time setup on the target phone. After this, every release published to
  GitHub installs silently within the Obtainium poll interval.

  ## Prerequisites

  - Phone with Android 7+ (we target API 35).
  - Laptop with `adb` installed (`brew install android-platform-tools` on macOS,
    or the SDK Platform-Tools from Android Studio on Linux/Windows).
  - The first release APK published on GitHub.

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
  https://github.com/<owner>/daily-habit-tracker/releases, tap
  `app-release.apk`, install. Open the app once, allow notifications when
  prompted.

  ### 4. Configure Obtainium

  Open Obtainium → "+" → paste
  `https://github.com/<owner>/daily-habit-tracker` → save. Confirm
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

  Trigger a release (push to main and approve, or `gh workflow run ci.yml --ref main`).
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
  gh release download <tag>
  apksigner verify --verbose app-release.apk
  ```

  Expected:

  ```
  Verified using v2 scheme (APK Signature Scheme v2): true
  Verified using v3 scheme (APK Signature Scheme v3): true
  ```

  If v2 is false, silent updates via Obtainium will not work. Fix the signing
  config in `android/app/build.gradle` and reinstall.
  ```

- [ ] **Step 2: Replace the at-write-time placeholder with the verified Obtainium package name**

  In the doc content above there are two distinct placeholders. Only **one** gets replaced here:

  - `<INSERT VERIFIED NAME>` (one occurrence, in the sentence "At the time of writing this doc the package name is ...") → replace with the value from Task 6.1 Step 3. This is a frozen-in-time reference for future-you.
  - `<OBTAINIUM_PACKAGE_NAME>` (in the `pm grant` command) → leave as-is, by design. The accompanying instructions tell readers to re-verify via `pm list packages`, since Obtainium's namespace shifts.

  Edit `docs/android-setup.md` and apply only the first replacement.

- [ ] **Step 3: Commit**

  ```bash
  git add docs/android-setup.md
  git commit -m "Add Android phone setup and silent-update docs"
  ```

### Task 6.3: Execute the phone setup on the Pixel 10a

**Files:** None (real-world execution; verifies the docs).

- [ ] **Step 1: Follow steps 1–4 of `docs/android-setup.md` on the phone**

  Walk through the doc as if you've never seen it. Note any step that's unclear or wrong.

- [ ] **Step 2: Run the ADB grant from step 5**

  ```bash
  adb shell pm grant <OBTAINIUM_PACKAGE_NAME> android.permission.INSTALL_PACKAGES
  ```

  Expected: no output (silent success). If "Unknown package," the package name is wrong — re-run `pm list packages | grep obtainium`.

- [ ] **Step 3: Toggle silent install on in Obtainium**

  Obtainium → Settings → Installation → "Install silently" → on.

### Task 6.4: Update README cross-reference

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Distribution" section pointing to the new doc**

  After the CI section in `README.md`, add:

  ```markdown
  ## Distribution

  Releases are produced automatically on every merge to `main` (after manual
  approval) and published as GitHub Releases. The target phone receives
  silent over-the-air updates via Obtainium. See `docs/android-setup.md` for
  the one-time phone setup.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add README.md
  git commit -m "README: link to Android phone setup doc"
  ```

### Task 6.5: Open PR 6 and merge

- [ ] **Step 1: Push and open PR**

  ```bash
  git push -u origin pivot/06-phone-setup-docs
  gh pr create --title "PR 6: Phone setup docs + verified silent update" --body "Adds docs/android-setup.md with the one-time phone setup procedure (Obtainium + ADB grant), troubleshooting, and apksigner verification. PR 6's own merge will exercise the silent-update loop end-to-end."
  ```

- [ ] **Step 2: Wait for CI green and merge**

  ```bash
  gh pr merge --squash --delete-branch
  ```

### Task 6.6: Verify silent update end-to-end (uses PR 6 merge as the test)

**Files:** None (real-world verification).

- [ ] **Step 1: Approve the release triggered by PR 6 merge**

  When PR 6 merges to `main`, the release job pauses for approval.

  ```bash
  gh run watch
  ```

  Open the run in the browser, click "Review deployments," approve `production`.

- [ ] **Step 2: Wait for the release to publish**

  ```bash
  gh release view --json tagName,assets
  ```

  Expected: latest release tagged `v0.0.1-r<count>` (or whatever the current `package.json.version` plus commit count produces), with `app-release.apk` attached.

- [ ] **Step 3: Wait up to one hour**

  Don't touch the phone. Don't open Obtainium and refresh manually — that defeats the test of the auto-poll.

- [ ] **Step 4: Verify the new version is installed silently on the phone**

  On the phone: Settings → Apps → DailyHabitTracker → version field should read `v0.0.1-r<count>` matching the published release.

  Expected: version matches, no notification was shown, no tap was needed.

  If the version didn't update, walk the troubleshooting list in `docs/android-setup.md`.

  *No commit; verification only. The pivot is done when this step passes.*

---

## Self-Review Checklist

Run through these against the spec before declaring done.

- [ ] PR 0 implements: spec Section "Implementation sequencing" PR 0 — repo rename.
- [ ] PR 1 implements: spec Sections 2, 7 (subset) — Android scaffold, build.gradle, signing fallback, manifest permissions, WatermelonDB + Notifee wiring, adaptive icon, `android` npm script, `android-build` CI job, `push: [main]` trigger.
- [ ] PR 2 implements: spec Section 4 cleanup — remove `e2e-tests` job before its referenced code is deleted.
- [ ] PR 3 implements: spec Sections 1, 7 — delete `ios/`, `e2e/`, `.detoxrc.js`, iOS scripts and devDependencies (conditional `jest-circus`), Platform.OS branches in NotificationService/typography/CreateHabitModal/others, README rewrite.
- [ ] PR 4 implements: spec Section 3 — keystore generation, multi-copy backup, GitHub secrets, `keystore.properties.example`, `.gitignore` for keystore artifacts, local release build verification with `apksigner` v2+v3.
- [ ] PR 5 implements: spec Section 4 release job, Section 5 versioning + GitHub Release publishing, `production` environment with manual approval gate.
- [ ] PR 6 implements: spec Section 6 — phone setup doc + executed setup + end-to-end silent-update verification, README cross-reference.

If any spec requirement has no implementing task, add the task here before handing off.
