import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme/colors';
import {fontFamily} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {borders, radii} from '../theme';

export interface HabitRatings {
  impact: number;
  friction: number;
  keystone: number;
  timeCost: number;
}

interface RatingEditorProps {
  ratings: HabitRatings;
  /**
   * Uncontrolled mode: the editor keeps its own draft and renders a save
   * button. Used by the habit detail screen, where ratings are saved on their
   * own. A rejection is caught and shown to the user, and the draft is kept.
   */
  onSave?: (ratings: HabitRatings) => Promise<void>;
  /**
   * Controlled mode: every change is reported up and no save button is drawn.
   * Used by the create modal, which saves through its own CREATE button.
   */
  onChange?: (ratings: HabitRatings) => void;
}

const fields: Array<{key: keyof HabitRatings; label: string}> = [
  {key: 'impact', label: 'IMPACT'},
  {key: 'friction', label: 'FRICTION'},
  {key: 'keystone', label: 'KEYSTONE'},
  {key: 'timeCost', label: 'TIME COST'},
];

const MIN_RATING = 1;
const MAX_RATING = 5;

const RatingEditor: React.FC<RatingEditorProps> = ({
  ratings,
  onSave,
  onChange,
}) => {
  const [draft, setDraft] = useState(ratings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(ratings), [ratings]);

  const change = useCallback(
    (key: keyof HabitRatings, delta: number) => {
      setDraft(current => {
        const next = {
          ...current,
          [key]: Math.max(
            MIN_RATING,
            Math.min(MAX_RATING, current[key] + delta),
          ),
        };
        onChange?.(next);
        return next;
      });
      // A new edit supersedes whatever the last failed save said.
      setError(null);
    },
    [onChange],
  );

  const save = useCallback(async () => {
    if (!onSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      // Keep `draft` as it is: the user's edit is the only copy of their
      // intent, and discarding it would present unsaved numbers as saved
      // (issue #127).
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not save your ratings. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  return (
    <View testID="rating-editor" style={styles.container}>
      <Text style={styles.heading}>RATE THIS HABIT</Text>
      {fields.map(({key, label}) => (
        <View
          key={key}
          style={styles.row}
          accessibilityRole="adjustable"
          accessibilityLabel={label.toLowerCase()}
          accessibilityValue={{
            min: MIN_RATING,
            max: MAX_RATING,
            now: draft[key],
          }}>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.controls}>
            <Pressable
              accessibilityLabel={`Decrease ${label.toLowerCase()}`}
              accessibilityRole="button"
              disabled={draft[key] <= MIN_RATING || saving}
              hitSlop={8}
              onPress={() => change(key, -1)}
              style={styles.button}>
              <Text style={styles.buttonText}>−</Text>
            </Pressable>
            <Text style={styles.value} testID={`rating-${key}`}>
              {draft[key]}
            </Text>
            <Pressable
              accessibilityLabel={`Increase ${label.toLowerCase()}`}
              accessibilityRole="button"
              disabled={draft[key] >= MAX_RATING || saving}
              hitSlop={8}
              onPress={() => change(key, 1)}
              style={styles.button}>
              <Text style={styles.buttonText}>+</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {error !== null && (
        <Text
          accessibilityLiveRegion="polite"
          style={styles.error}
          testID="rating-save-error">
          {error}
        </Text>
      )}
      {onSave && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save habit ratings"
          accessibilityState={{busy: saving, disabled: saving}}
          disabled={saving}
          onPress={save}
          style={styles.saveButton}>
          <Text style={styles.saveText}>
            {saving ? 'SAVING…' : 'SAVE RATINGS'}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderWidth: borders.base,
    borderColor: colors.line,
    borderRadius: radii.card,
  },
  heading: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.textSoft,
    letterSpacing: 0.7,
    marginBottom: spacing.sm,
  },
  row: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: borders.thin,
    borderTopColor: colors.line,
  },
  label: {fontFamily: fontFamily.mono, fontSize: 11, color: colors.text},
  controls: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  button: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.darkBg,
    borderRadius: radii.card,
  },
  buttonText: {fontSize: 20, lineHeight: 22, color: colors.darkBgText},
  value: {
    minWidth: 18,
    textAlign: 'center',
    fontFamily: fontFamily.display,
    fontSize: 20,
    color: colors.regalia,
  },
  error: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.error,
  },
  saveButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.tiger,
    borderWidth: borders.base,
    borderColor: colors.tigerDeep,
    borderRadius: radii.card,
  },
  saveText: {fontFamily: fontFamily.mono, fontSize: 11, color: colors.darkBg},
});

export default RatingEditor;
