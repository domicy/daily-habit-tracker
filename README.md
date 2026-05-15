# DailyHabitTracker

A React Native Android app for building and tracking daily habits. Built with the React Native CLI (no Expo) for full native module access. Distributed via sideloaded APK + Obtainium auto-updates.

## Prerequisites

| Tool             | Version                       | Notes                                                  |
|------------------|-------------------------------|--------------------------------------------------------|
| Node.js          | >= 20                         | LTS recommended                                        |
| JDK              | 17                            | Temurin or any OpenJDK 17 build                        |
| Android SDK      | Platform 35, Build-Tools 35.x | Install via Android Studio SDK Manager                 |
| Android emulator | API 34+                       | Or a physical device with USB debugging enabled        |
| Watchman         | latest                        | `brew install watchman` (recommended)                  |

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd daily-habit-tracker
```

### 2. Install JavaScript dependencies

```bash
npm install
```

### 3. Run on Android emulator

Start an emulator from Android Studio (Device Manager), then:

```bash
npm run android
```

To target a specific device:

```bash
npx react-native run-android --device <id>
```

## Available Scripts

| Command              | Description                          |
|----------------------|--------------------------------------|
| `npm start`          | Start the Metro bundler              |
| `npm run android`    | Build and run on Android device/emulator |
| `npm test`           | Run Jest unit tests                  |
| `npm run typecheck`  | Run TypeScript type checking         |
| `npm run lint`       | Run ESLint                           |

## Project Structure

```
src/
  components/    # Reusable UI components
  screens/       # Full screen views
  models/        # WatermelonDB schema and model classes
  services/      # API client, sync engine, notification service
  hooks/         # Custom React hooks
  utils/         # Pure helper functions (date math, streak calc)
  theme/         # Colors, typography, spacing constants
  navigation/    # React Navigation config
  __tests__/     # Mirrors src/ structure for test files
android/         # Android native project (Gradle, Kotlin)
backend/         # FastAPI sync backend (Docker + Cloudflared)
```

## CI

This project uses GitHub Actions for continuous integration. The workflow is defined in `.github/workflows/ci.yml`.

### CI Jobs

| Job                  | Trigger                          | Runner         | Description                                                                |
|----------------------|----------------------------------|----------------|----------------------------------------------------------------------------|
| `lint-and-type-check`| Push to `main` / PR              | `ubuntu-latest`| Runs ESLint and TypeScript compiler (`tsc --noEmit`)                       |
| `unit-tests`         | Push to `main` / PR              | `ubuntu-latest`| Runs Jest with `--coverage --ci`, uploads coverage artifact                |
| `backend-tests`      | Push to `main` / PR              | `ubuntu-latest`| Runs pytest with coverage (minimum 85%)                                    |
| `android-build`      | Push to `main` / PR              | `ubuntu-latest`| Runs `./gradlew assembleRelease` with debug-signing fallback to verify build |

### Coverage Thresholds

- **Frontend (Jest):** 55% minimum for branches; 80% minimum for lines and functions (enforced in `jest.config.js`).
- **Backend (pytest):** 85% minimum line coverage (enforced via `--cov-fail-under=85`).

## Distribution

Releases are produced automatically on every push to `main` and published as GitHub Releases with the signed APK attached. The target phone receives silent over-the-air updates via Obtainium. See `docs/android-setup.md` for the one-time phone setup and troubleshooting.

## Troubleshooting

- **Gradle build fails with Kotlin metadata version error**: Confirm `@react-native-async-storage/async-storage` is pinned to `^2.x` (not `^3.x`); v3 requires Kotlin 2.2+ but RN 0.78 ships Kotlin 2.0.x.
- **Android device not detected**: Run `adb devices` to confirm the device is recognized; enable USB debugging in Developer Options on the phone.
- **Metro bundler errors**: Clear the cache with `npx react-native start --reset-cache`.
