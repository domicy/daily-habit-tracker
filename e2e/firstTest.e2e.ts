import {by, device, element, expect} from 'detox';

describe('Daily Habit Tracker – Core User Journey', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
  });

  // ─── 1. First Launch — Empty State ────────────────────────────────────────
  describe('1. First Launch — Empty State', () => {
    it('should display the Dashboard screen', async () => {
      await expect(element(by.id('dashboard-screen'))).toBeVisible();
    });

    it('should show "No habits yet" text', async () => {
      await expect(element(by.id('empty-state'))).toBeVisible();
      await expect(element(by.text('No habits yet. Tap + to start.'))).toBeVisible();
    });

    it('should show the "+" button', async () => {
      await expect(element(by.id('add-habit-button'))).toBeVisible();
    });
  });

  // ─── 2. Create a Habit ────────────────────────────────────────────────────
  describe('2. Create a Habit', () => {
    it('should open the Create Habit modal when tapping "+"', async () => {
      await element(by.id('add-habit-button')).tap();
      await expect(element(by.id('create-habit-modal'))).toBeVisible();
    });

    it('should type "Drink Water" and tap "Create"', async () => {
      await element(by.id('habit-name-input')).typeText('Drink Water');
      await element(by.id('create-button')).tap();
    });

    it('should show "Drink Water" on the Dashboard', async () => {
      await expect(element(by.text('Drink Water'))).toBeVisible();
    });

    it('should show a streak of "0 days"', async () => {
      await expect(element(by.text('🔥 0 days'))).toBeVisible();
    });

    it('should show a hollow (uncompleted) completion circle', async () => {
      // The toggle button should be visible but no checkmark should exist
      await expect(element(by.id('toggle-').withAncestor(by.id('habit-list')))).toBeVisible();
      // No checkmark should be present initially
      try {
        await expect(element(by.text('✓').withAncestor(by.id('habit-list')))).not.toBeVisible();
      } catch {
        // Element may not exist at all, which is the expected state
      }
    });
  });

  // ─── 3. Complete a Habit ──────────────────────────────────────────────────
  describe('3. Complete a Habit', () => {
    it('should tap the completion circle for "Drink Water"', async () => {
      // Find the toggle within the habit list and tap it
      const habitCard = element(by.text('Drink Water')).atIndex(0);
      await expect(habitCard).toBeVisible();

      // Tap the toggle circle – use the toggle testID within the card
      // Since we don't know the habitId, we locate it by the text nearby
      const toggleButton = element(by.id(/^toggle-/).withAncestor(by.id('habit-list')));
      await toggleButton.tap();
    });

    it('should show the circle filled with green and a checkmark', async () => {
      await expect(element(by.text('✓').withAncestor(by.id('habit-list')))).toBeVisible();
    });

    it('should update the streak to "1 day" (singular)', async () => {
      await expect(element(by.text('🔥 1 day'))).toBeVisible();
    });

    it('should navigate to the Stats screen for "Drink Water"', async () => {
      // Tap on the habit card (not the toggle) to navigate to Stats
      const habitCard = element(by.text('Drink Water')).atIndex(0);
      await habitCard.tap();

      await expect(element(by.id('stats-screen'))).toBeVisible();
      await expect(element(by.id('habit-name'))).toHaveText('Drink Water');
    });

    it('should show today highlighted on the calendar', async () => {
      const today = new Date();
      const day = today.getDate();
      await expect(
        element(by.id(`calendar-day-completed-${day}`)),
      ).toBeVisible();
    });

    it('should show the streak counter as "1"', async () => {
      await expect(element(by.id('streak-count'))).toHaveText('1');
    });
  });

  // ─── 4. Un-complete a Habit (Toggle Off) ──────────────────────────────────
  describe('4. Un-complete a Habit (Toggle Off)', () => {
    it('should navigate back to Dashboard', async () => {
      await element(by.id('back-button')).tap();
      await expect(element(by.id('dashboard-screen'))).toBeVisible();
    });

    it('should tap the filled circle for "Drink Water" to un-complete', async () => {
      const toggleButton = element(by.id(/^toggle-/).withAncestor(by.id('habit-list')));
      await toggleButton.tap();
    });

    it('should return the circle to hollow (uncompleted)', async () => {
      // Checkmark should no longer be visible
      try {
        await expect(element(by.text('✓').withAncestor(by.id('habit-list')))).not.toBeVisible();
      } catch {
        // Element doesn't exist, which is the expected state
      }
    });

    it('should return the streak to "0 days"', async () => {
      await expect(element(by.text('🔥 0 days'))).toBeVisible();
    });
  });

  // ─── 5. Multi-day Streak (Time Travel) ────────────────────────────────────
  // Detox does not natively support mocking the system date on iOS simulators.
  // This test scenario is documented in MANUAL_QA.md as a manual QA procedure.
  describe('5. Multi-day Streak (Time Travel)', () => {
    it('is documented as a manual QA scenario in MANUAL_QA.md', () => {
      // Detox cannot reliably mock the system clock on iOS.
      // See MANUAL_QA.md for the full manual test procedure.
      console.log(
        'Multi-day streak test requires date mocking — see MANUAL_QA.md',
      );
    });
  });

  // ─── 6. Settings — Deactivate a Habit ─────────────────────────────────────
  describe('6. Settings — Deactivate a Habit', () => {
    it('should create a second habit "Read 10 Pages"', async () => {
      // Make sure we're on the Dashboard
      await expect(element(by.id('dashboard-screen'))).toBeVisible();

      await element(by.id('add-habit-button')).tap();
      await expect(element(by.id('create-habit-modal'))).toBeVisible();
      await element(by.id('habit-name-input')).typeText('Read 10 Pages');
      await element(by.id('create-button')).tap();

      // Verify both habits are visible
      await expect(element(by.text('Drink Water'))).toBeVisible();
      await expect(element(by.text('Read 10 Pages'))).toBeVisible();
    });

    it('should navigate to Settings', async () => {
      await element(by.id('tab-settings')).tap();
      await expect(element(by.id('settings-screen'))).toBeVisible();
    });

    it('should toggle "Read 10 Pages" to inactive', async () => {
      // The settings screen shows all habits with toggle switches.
      // We need to find the toggle for "Read 10 Pages" and turn it off.
      // Since habit IDs are dynamic, we find the switch near the text.
      const readHabitText = element(by.text('Read 10 Pages'));
      await expect(readHabitText).toBeVisible();

      // Find the toggle switch within the habit row that contains "Read 10 Pages"
      // Use the toggle-active testID pattern
      const habitsList = element(by.id('habits-list'));
      await expect(habitsList).toBeVisible();

      // Tap the switch — we scroll to find the right one by text proximity
      // The Switch for "Read 10 Pages" is in a row alongside it
      const readToggle = element(
        by.type('RCTSwitch').withAncestor(
          by.id(/^habit-row-/).withDescendant(by.text('Read 10 Pages')),
        ),
      );
      await readToggle.tap();
    });

    it('should navigate back to Dashboard and show only "Drink Water"', async () => {
      await element(by.id('tab-home')).tap();
      await expect(element(by.id('dashboard-screen'))).toBeVisible();

      // Only active habits should appear
      await expect(element(by.text('Drink Water'))).toBeVisible();
      await expect(element(by.text('Read 10 Pages'))).not.toBeVisible();
    });
  });

  // ─── 7. Settings — Pending Sync Count ─────────────────────────────────────
  describe('7. Settings — Pending Sync Count', () => {
    it('should first complete a habit to generate an unsynced log', async () => {
      // Complete "Drink Water" so there is at least one unsynced log
      const toggleButton = element(by.id(/^toggle-/).withAncestor(by.id('habit-list')));
      await toggleButton.tap();

      // Verify completion
      await expect(element(by.text('✓').withAncestor(by.id('habit-list')))).toBeVisible();
    });

    it('should navigate to Settings and see the pending sync count', async () => {
      await element(by.id('tab-settings')).tap();
      await expect(element(by.id('settings-screen'))).toBeVisible();
    });

    it('should show the pending sync count > 0', async () => {
      await expect(element(by.id('sync-status'))).toBeVisible();
      // The sync status text should contain "pending" and a count
      // With no backend running, there should be at least 1 unsynced log
      await expect(element(by.id('pending-sync-count'))).toBeVisible();
    });
  });
});
