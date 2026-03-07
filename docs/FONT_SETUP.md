# Custom Font Setup

The Daily Habit Tracker uses two custom font families:

- **Trade Gothic Next LT Bold** (`TradeGothicNextLT-Bold`) — headings
- **Biotif Regular** (`Biotif-Regular`) — body text

## 1. Add Font Files

Place `.otf` or `.ttf` files in `assets/fonts/`:

```
assets/
  fonts/
    TradeGothicNextLT-Bold.otf
    Biotif-Regular.otf
```

## 2. Configure react-native.config.js

Add the following to the project root `react-native.config.js`:

```js
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./assets/fonts'],
};
```

## 3. Link the Fonts

Run the asset linking command:

```bash
npx react-native-asset
```

This copies fonts into the iOS and Android bundles automatically.

## 4. iOS — Verify Info.plist

After linking, confirm that `ios/DailyHabitTracker/Info.plist` contains the font
entries under `UIAppFonts`:

```xml
<key>UIAppFonts</key>
<array>
  <string>TradeGothicNextLT-Bold.otf</string>
  <string>Biotif-Regular.otf</string>
</array>
```

If they are missing, add them manually.

## 5. Android

After running `npx react-native-asset`, font files are copied to
`android/app/src/main/assets/fonts/`. No additional configuration is needed.

## Fallback Fonts

If the custom fonts are not available (e.g., licensing restrictions or loading
failures), the app falls back to system fonts defined in `src/theme/typography.ts`:

| Role    | Custom Font              | iOS Fallback     | Android Fallback |
| ------- | ------------------------ | ---------------- | ---------------- |
| Heading | TradeGothicNextLT-Bold   | System           | sans-serif       |
| Body    | Biotif-Regular           | San Francisco    | sans-serif       |
| Mono    | Menlo (iOS) / monospace  | Menlo            | monospace        |

To use fallbacks in components, prefer the primary font and fall back gracefully:

```tsx
import { fontFamily } from '../theme';

const styles = StyleSheet.create({
  heading: {
    fontFamily: fontFamily.heading, // falls back automatically on missing font
  },
});
```

React Native will fall back to the platform default if a specified `fontFamily`
is not found, so the app remains usable without the custom fonts installed.
