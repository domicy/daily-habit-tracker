# Custom Font Setup

The Daily Habit Tracker uses three custom font families from the Soft Clemson
v3 design system:

- **Archivo Black** (`Archivo Black`) — display / headlines
- **Space Grotesk** (`Space Grotesk`) — body
- **Space Mono** (`Space Mono`) — labels, monospace data

All three are open-source (SIL Open Font License) and available on Google Fonts.

## 1. Add Font Files

Place the TTF files in `assets/fonts/`:

```
assets/
  fonts/
    ArchivoBlack-Regular.ttf
    SpaceGrotesk-Regular.ttf
    SpaceGrotesk-Bold.ttf
    SpaceMono-Regular.ttf
    SpaceMono-Bold.ttf
```

Download links:

- Archivo Black: https://fonts.google.com/specimen/Archivo+Black
- Space Grotesk: https://fonts.google.com/specimen/Space+Grotesk
- Space Mono: https://fonts.google.com/specimen/Space+Mono

## 2. Configure react-native.config.js

`react-native.config.js` in the project root declares the asset directory:

```js
module.exports = {
  project: {
    android: {},
  },
  assets: ['./assets/fonts'],
};
```

## 3. Link the Fonts

Run the asset linker:

```bash
npx react-native-asset
```

This copies the fonts into `android/app/src/main/assets/fonts/`. Rebuild the
Android app (`npm run android`) to pick them up.

## Fallback Fonts

If a font isn't linked, React Native silently substitutes the Android system
font. The app remains usable; only the type treatment degrades.

| Role    | Custom Font     | Android Fallback |
| ------- | --------------- | ---------------- |
| Display | Archivo Black   | sans-serif       |
| Body    | Space Grotesk   | sans-serif       |
| Mono    | Space Mono      | monospace        |

The `fontFamily` values are imported from `src/theme/typography.ts`:

```tsx
import {fontFamily} from '../theme';

const styles = StyleSheet.create({
  headline: {
    fontFamily: fontFamily.display, // "Archivo Black"
  },
});
```
