# DailyHabitTracker

A React Native iOS app for building and tracking daily habits. Built with the React Native CLI (no Expo) for full native module access.

## Prerequisites

| Tool       | Version   | Notes                                      |
|------------|-----------|--------------------------------------------|
| Node.js    | >= 18     | LTS recommended                            |
| Ruby       | >= 2.6.10 | Required by CocoaPods                      |
| Xcode      | >= 15     | Install from the Mac App Store             |
| CocoaPods  | >= 1.14   | `sudo gem install cocoapods`               |
| Watchman   | latest    | `brew install watchman` (recommended)      |

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd habit-tracker
```

### 2. Install JavaScript dependencies

```bash
npm install
```

### 3. Install iOS native dependencies

```bash
cd ios
pod install
cd ..
```

### 4. Run on iOS Simulator

```bash
npx react-native run-ios
```

To target a specific simulator:

```bash
npx react-native run-ios --simulator="iPhone 16"
```

## Available Scripts

| Command              | Description                          |
|----------------------|--------------------------------------|
| `npm start`          | Start the Metro bundler              |
| `npm run ios`        | Build and run on iOS Simulator       |
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
e2e/             # Detox end-to-end tests
```

## Troubleshooting

- **Pod install fails**: Make sure you have the correct Ruby version and run `sudo gem install cocoapods` first.
- **Build fails in Xcode**: Open `ios/DailyHabitTracker.xcworkspace` (not `.xcodeproj`) and ensure a valid signing team is selected.
- **Metro bundler errors**: Clear the cache with `npx react-native start --reset-cache`.
