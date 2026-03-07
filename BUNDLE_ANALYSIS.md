# Bundle Size Analysis

Analyzed via dependency review (run `npx react-native-bundle-visualizer` for exact figures).

## Top 5 Largest Dependencies (estimated gzipped)

| # | Dependency | Est. Size (gzipped) | Notes |
|---|-----------|---------------------|-------|
| 1 | `@notifee/react-native` | ~150-200KB | Native module, large but no lighter RN alternative with same feature set |
| 2 | `@nozbe/watermelondb` | ~80-120KB | Core architecture dependency, no replacement |
| 3 | `date-fns` | ~20-80KB (tree-shakeable) | Depends on imports; tree-shakes well with named imports |
| 4 | `axios` + `axios-retry` | ~15-30KB | Could be replaced with native `fetch` + small retry wrapper |
| 5 | `@react-navigation/*` | ~40-60KB (combined) | Standard RN navigation, no lighter alternative |

## Recommendations

- **axios**: At ~15-30KB gzipped, this could be replaced with the built-in `fetch` API
  plus a small retry utility (~2KB). See TODO in `src/services/api.ts`.
- **date-fns**: Already tree-shakeable. Ensure only specific functions are imported
  (not the entire library). Current usage looks correct with named imports.
- **@notifee/react-native**: Largest dependency but provides critical notification
  features with New Architecture support. No lighter alternative available.
