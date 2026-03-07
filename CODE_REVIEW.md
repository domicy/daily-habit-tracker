# Code Review Report — Final Quality Gate

**Date:** 2026-03-07
**Reviewer:** Claude (automated)
**Scope:** Full codebase (frontend + backend)

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2     |
| Major    | 10    |
| Minor    | 12    |

---

## CRITICAL

### C-1. JWT secret has an insecure hardcoded default

- **File:** `backend/app/config.py:6`
- **Code:** `jwt_secret: str = "change-me"`
- **Issue:** The `Settings` model has `"change-me"` as a default value for `jwt_secret`. If the `.env` file is missing or `JWT_SECRET` is not set, the application starts with a guessable secret, allowing anyone to forge tokens.
- **Fix:** Remove the default so startup fails if the env var is missing:

```python
jwt_secret: str  # No default — forces env var to be set
```

### C-2. Auth endpoint uses JWT secret as the pre-shared secret

- **File:** `backend/app/routers/auth.py:14`
- **Code:** `if body.secret != settings.jwt_secret:`
- **Issue:** The pre-shared secret used by the mobile app to authenticate is the **same value** as the JWT signing key. If a user enters the secret on their phone (as designed for the one-time setup screen), they now possess the JWT signing key and can forge arbitrary tokens with any `sub`, `exp`, or custom claims. These are two fundamentally different secrets.
- **Fix:** Add a separate `PRESHARED_SECRET` setting in `config.py` and compare against that:

```python
# config.py
preshared_secret: str  # No default

# routers/auth.py
if body.secret != settings.preshared_secret:
```

---

## MAJOR

### M-1. `App.tsx` — async IIFE in useEffect lacks error handling

- **File:** `src/App.tsx:14-21`
- **Issue:** The `async` IIFE has no `try/catch`. If `AsyncStorage.getItem` or `scheduleDailyReminder` throws, the error is silently swallowed as an unhandled promise rejection.
- **Fix:** Wrap the body in `try/catch` with `console.warn` (notification rescheduling is non-critical).

### M-2. `StatsScreen` — async effects lack error handling

- **File:** `src/screens/StatsScreen.tsx:68-78` and `:81-98`
- **Issue:** Both `useEffect` hooks contain async IIFEs with no `try/catch`. If `getHabitById` or `calculateStreak` throws (e.g., habit deleted), the screen crashes with an unhandled rejection.
- **Fix:** Wrap each async body in `try/catch` and show a fallback or navigate back.

### M-3. `SettingsScreen` — `handleToggleActive` lacks error handling

- **File:** `src/screens/SettingsScreen.tsx:84-88`
- **Issue:** No `try/catch`. A WatermelonDB write failure will become an unhandled rejection.
- **Fix:** Add `try/catch` with a user-friendly alert.

### M-4. `SettingsScreen` — `handleReminderToggle` lacks error handling

- **File:** `src/screens/SettingsScreen.tsx:111-123`
- **Issue:** No `try/catch` around the `onNotificationToggle` call or `AsyncStorage.setItem`. Errors propagate as unhandled rejections.
- **Fix:** Wrap in `try/catch`.

### M-5. `SettingsScreen` — `handleTimeChange` lacks error handling

- **File:** `src/screens/SettingsScreen.tsx:125-137`
- **Issue:** Same pattern — no `try/catch` on async callback.

### M-6. `SyncService.startBackgroundSync` — unhandled promise from `pushUnsyncedLogs`

- **File:** `src/services/SyncService.ts:265`
- **Code:** `this.pushUnsyncedLogs();`
- **Issue:** The return value (a `Promise`) is discarded without `.catch()`. While `pushUnsyncedLogs` currently handles errors internally, if `AsyncStorage` fails before the internal try/catch, this becomes an unhandled rejection.
- **Fix:** Add `.catch(() => {})`.

### M-7. `SyncService.debouncedSync` — same unhandled promise

- **File:** `src/services/SyncService.ts:276`
- **Fix:** Same as M-6.

### M-8. Screens import `database` directly (architecture violation)

- **Files:**
  - `src/screens/DashboardScreen.tsx:18`
  - `src/screens/CreateHabitModal.tsx:15`
  - `src/screens/StatsScreen.tsx:17`
  - `src/screens/SettingsScreen.tsx:22`
- **Issue:** Screens import `database` from `../models` to construct a default `HabitService`. While the service is injectable via props, the import creates architectural coupling — screens should not know about the database.
- **Fix:** Lift `HabitService` instantiation to the app root or a React Context provider and inject via context, removing `import database` from all screens.

### M-9. `SyncService` uses `any` types without justification comments

- **File:** `src/services/SyncService.ts:40,56,60,84,125,201`
- **Issue:** Multiple parameters typed as `any` (e.g., `error: any` in `isNetworkError`, `is5xxError`, `is401Error`, `handleSyncError`, catch blocks) without the required justification comment.
- **Fix:** Either type as `unknown` with narrowing, or add justification comments like `// any: Axios error shape is not strictly typed by AxiosError generic`.

### M-10. `HomeScreen` is dead code

- **File:** `src/screens/HomeScreen.tsx`
- **Issue:** Not imported or used anywhere in navigation. Uses hardcoded colors instead of theme system, has no `accessibilityLabel`, and has no tests.
- **Fix:** Delete the file or integrate it into the app.

---

## MINOR

### m-1. `console.warn` in SyncService runs in production

- **Files:** `src/services/SyncService.ts:203,207`
- **Issue:** `console.warn` in `handleSyncError` runs unconditionally. While not leaking stack traces, logging error messages to the device console could expose internal API structure.
- **Fix:** Guard with `if (__DEV__)` or remove.

### m-2. Missing `accessibilityLabel` on interactive elements

- **Files:**
  - `src/screens/SettingsScreen.tsx:209` — Daily Reminder `Switch`
  - `src/screens/SettingsScreen.tsx:226-234` — Time picker `TouchableOpacity` items
  - `src/screens/SettingsScreen.tsx:273-277` — "Sync Now" button
  - `src/components/HabitCard.tsx:75-79` — Outer `TouchableOpacity` (navigates to Stats)
- **Fix:** Add `accessibilityLabel` to each element.

### m-3. Color contrast — `clemsonOrange` on `background` borderline WCAG AA

- **File:** `src/theme/colors.ts`
- **Issue:** `clemsonOrange: '#F56600'` on `background: '#1A1A2E'` yields approximately **4.4:1** contrast ratio — just below the 4.5:1 AA threshold for normal (16px) text. Used for heading text in Dashboard and Settings titles.
- **Fix:** Slightly lighten the orange (e.g., `#F67100` or `#F87000`) or darken the background to push the ratio above 4.5:1.

### m-4. Missing `accessibilityLabel` on per-habit active `Switch`

- **File:** `src/screens/SettingsScreen.tsx:169-175`
- **Fix:** Add `accessibilityLabel={`Toggle ${item.name} active`}`.

### m-5. `health` endpoint has no return type annotation

- **File:** `backend/app/main.py:13`
- **Fix:** Add `-> dict[str, str]` or a Pydantic response schema.

### m-6. `get_db` return type annotation is incorrect

- **File:** `backend/app/database.py:9`
- **Code:** `async def get_db() -> AsyncSession:  # type: ignore[misc]`
- **Issue:** This is an async generator; correct type is `AsyncGenerator[AsyncSession, None]`.
- **Fix:** `from collections.abc import AsyncGenerator` and annotate properly.

### m-7. Backend router functions missing return type annotations

- **Files:** `backend/app/routers/habits.py:21,30,39` and `backend/app/routers/logs.py:20,62`
- **Issue:** Functions lack explicit return type annotations.

### m-8. README missing frontend deploy section

- **File:** `README.md`
- **Issue:** Covers setup, build, and test, but no deployment section for the iOS app (e.g., Fastlane, TestFlight, App Store submission).
- **Fix:** Add a "Deployment" section.

### m-9. No JSDoc on `useHabits` hook

- **File:** `src/hooks/useHabits.ts:16`
- **Fix:** Add JSDoc describing return shape, reactive behavior, and midnight rollover handling.

### m-10. `useSubscriptionLeakDetector` comment is not JSDoc format

- **File:** `src/hooks/useSubscriptionLeakDetector.ts:17`
- **Issue:** Block comment won't be picked up by documentation tools.
- **Fix:** Convert to `/** */` JSDoc format.

### m-11. `HabitService.calculateStreak` — `T00:00:00` suffix not explained

- **File:** `src/services/HabitService.ts:121,138`
- **Code:** `new Date(asOfDate + 'T00:00:00')`
- **Fix:** Add inline comment: `// Append T00:00:00 to parse as local time, not UTC (see dateUtils.ts)`.

### m-12. `SettingsScreen` — `handleSyncNow` has `hService` in dependency array but doesn't use it

- **File:** `src/screens/SettingsScreen.tsx:154`
- **Code:** `}, [sService, hService]);`
- **Issue:** `hService` is listed in the `useCallback` dependency array but is not referenced inside the callback body.
- **Fix:** Remove `hService` from the dependency array.

---

## TESTING COVERAGE

### Edge Cases (Design Doc)

| Edge Case                  | Covered | Location                                                  |
|----------------------------|---------|-----------------------------------------------------------|
| Midnight streak reset      | Yes     | `src/__tests__/utils/dateUtils.test.ts:113-148`           |
| Streak with no rest tokens | Yes     | `src/__tests__/services/HabitService.test.ts:210-219`     |
| Toggle idempotency         | Yes     | `src/__tests__/services/HabitService.test.ts:144-157`     |
| Sync retry on failure      | Yes     | `SyncService.test.ts:159-201`, `SyncService.hardening.test.ts` |

### Service & Screen Test Coverage

| Service/Screen      | Has Tests | Snapshot | Notes                          |
|---------------------|-----------|----------|--------------------------------|
| HabitService        | Yes       | N/A      | 16+ tests                      |
| SyncService         | Yes       | N/A      | 40+ tests across 2 files       |
| NotificationService | Yes       | N/A      | 11 tests                       |
| DashboardScreen     | Yes       | Yes      | Render + behavior + accessibility |
| CreateHabitModal    | Yes       | No       | Render + behavior               |
| StatsScreen         | Yes       | Yes      | Render + snapshot               |
| SettingsScreen      | Yes       | No       | Render + behavior               |
| HomeScreen          | **No**    | No       | Dead code — not in navigation   |

---

## SECURITY SUMMARY

| Check                                         | Status   | Notes                                    |
|------------------------------------------------|----------|------------------------------------------|
| JWT secret from env var only                   | **FAIL** | Has insecure default `"change-me"` (C-1) |
| Pre-shared secret != JWT signing key           | **FAIL** | Same value used for both (C-2)           |
| App does NOT bundle the pre-shared secret      | PASS     | Entered via one-time setup, stored in AsyncStorage |
| No sensitive data logged in production         | WARN     | `console.warn` not guarded by `__DEV__` (m-1) |

## ARCHITECTURE SUMMARY

| Check                                          | Status      | Notes                                     |
|-------------------------------------------------|-------------|-------------------------------------------|
| Screens access DB only through HabitService     | **PARTIAL** | Screens import `database` for defaults (M-8) |
| No business logic in UI components              | PASS        | All logic in services/hooks               |
| No circular dependencies                        | PASS        | Clean dependency graph                    |
| All API responses validated against schemas      | PASS        | Pydantic (backend), TypeScript interfaces (frontend) |
