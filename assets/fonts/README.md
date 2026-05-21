# Font assets

The Soft Clemson v3 design system uses three open-source families. Drop the
following TTF files into this directory and then run `npx react-native-asset`
+ a Gradle rebuild to link them on Android.

Required files (exact filenames matter — they become the `fontFamily` value):

```
ArchivoBlack-Regular.ttf
SpaceGrotesk-Regular.ttf
SpaceGrotesk-Bold.ttf
SpaceMono-Regular.ttf
SpaceMono-Bold.ttf
```

Sources (Open Font License):

- Archivo Black: https://fonts.google.com/specimen/Archivo+Black
- Space Grotesk: https://fonts.google.com/specimen/Space+Grotesk
- Space Mono: https://fonts.google.com/specimen/Space+Mono

Until the assets are present and linked, React Native will fall back to the
Android system font — the layout still works, only the type treatment is off.
