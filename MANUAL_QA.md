# Manual QA Scenarios

## 5. Multi-day Streak (Time Travel)

Detox does not natively support mocking the system date on iOS simulators.
This test case must be verified manually.

### Prerequisites
- App is installed on an iOS Simulator (iPhone 15, iOS 17).
- At least one habit exists (e.g., "Drink Water").

### Steps

1. **Day 1 — Complete the habit**
   - Open the app.
   - Tap the completion circle for "Drink Water".
   - Verify the streak shows **"1 day"**.

2. **Day 2 — Advance the simulator date by 1 day**
   - Open the iOS Simulator.
   - Go to **Settings > General > Date & Time**.
   - Turn off "Set Automatically".
   - Set the date to **tomorrow** (current date + 1 day).
   - Return to the app (or relaunch it).
   - Tap the completion circle for "Drink Water".
   - Verify the streak shows **"2 days"**.

3. **Day 3 — Advance the simulator date by 1 more day**
   - Repeat the date advancement (current date + 2 days total).
   - Return to the app.
   - Tap the completion circle for "Drink Water".
   - Verify the streak shows **"3 days"**.

4. **Verify Stats screen**
   - Tap on the "Drink Water" habit card to open the Stats screen.
   - Verify the streak counter shows **3**.
   - Verify three dates are highlighted on the calendar (the three consecutive days).

5. **Break the streak**
   - Advance the date by **2 more days** (skipping one day).
   - Return to the app.
   - Verify the streak has reset to **"0 days"** (the skipped day broke the streak).
   - Tap the completion circle.
   - Verify the streak shows **"1 day"** (new streak started).

6. **Reset the simulator date**
   - Go back to **Settings > General > Date & Time**.
   - Turn "Set Automatically" back on.
   - Verify the app still functions correctly with the real date.

### Expected Results
- Streak increments by 1 for each consecutive day the habit is completed.
- Skipping a day resets the streak to 0.
- The Stats screen calendar accurately reflects which days were completed.
- The app handles date rollback gracefully without data corruption.

### Alternative Automation Approaches
If automated date mocking is needed in the future, consider:
- **react-native-date-picker mock**: Inject a date provider that can be controlled via a Detox launch argument.
- **Custom debug API**: Add a hidden debug endpoint (debug builds only) that overrides `getTodayString()` via a launch argument, e.g.:
  ```
  await device.launchApp({launchArgs: {mockDate: '2026-03-08'}});
  ```
  Then read `launchArgs.mockDate` in `dateUtils.ts` to override the current date.
- **xcrun simctl**: Use `xcrun simctl status_bar` for UI-level mocking (does not affect `Date` objects in JS).
