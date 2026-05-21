import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import {colors} from '../theme/colors';
import {fontFamily} from '../theme/typography';
import {spacing} from '../theme/spacing';
import {radii, borders, shadowOffsets} from '../theme/radii';
import NBCard from '../components/atoms/NBCard';
import NBButton from '../components/atoms/NBButton';
import NBShadow from '../components/atoms/NBShadow';
import HabitService from '../services/HabitService';
import database from '../models';

const MAX_LENGTH = 50;

interface CreateHabitModalProps {
  navigation?: {goBack: () => void};
  habitService?: HabitService;
}

const defaultHabitService = new HabitService(database);

const CreateHabitModal: React.FC<CreateHabitModalProps> = ({
  navigation,
  habitService,
}) => {
  const service = habitService ?? defaultHabitService;
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  const handleCreate = useCallback(async () => {
    if (!isValid || creating) {
      return;
    }
    setCreating(true);
    try {
      await service.createHabit(trimmedName);
      navigation?.goBack();
    } catch {
      // ignore; user can retry
    } finally {
      setCreating(false);
    }
  }, [isValid, creating, service, trimmedName, navigation]);

  const handleCancel = useCallback(() => {
    navigation?.goBack();
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="height"
      testID="create-habit-modal">
      <NBCard style={styles.cardWrap}>
        <View style={styles.strip}>
          <Text style={styles.stripText}>NEW HABIT</Text>
          <Text style={styles.stripText}>
            {name.length}/{MAX_LENGTH}
          </Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>NAME IT</Text>

          <NBShadow
            offsetX={shadowOffsets.xs}
            offsetY={shadowOffsets.xs}
            color={colors.shadow}
            borderRadius={radii.inner}
            style={styles.inputShadow}>
            <TextInput
              style={styles.input}
              placeholder="e.g., Drink Water, Read 10 Pages"
              placeholderTextColor={colors.textSoft}
              value={name}
              onChangeText={setName}
              maxLength={MAX_LENGTH}
              autoFocus
              testID="habit-name-input"
              accessibilityLabel="Habit name"
            />
          </NBShadow>

          <Text style={styles.counter} testID="char-counter">
            {name.length}/{MAX_LENGTH}
          </Text>

          <View style={styles.buttons}>
            <NBButton
              variant="secondary"
              testID="cancel-button"
              onPress={handleCancel}
              style={styles.button}>
              CANCEL
            </NBButton>
            <NBButton
              variant="primary"
              testID="create-button"
              onPress={handleCreate}
              disabled={!isValid || creating}
              loading={creating}
              style={styles.button}>
              CREATE
            </NBButton>
          </View>
        </View>
      </NBCard>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  cardWrap: {
    alignSelf: 'stretch',
  },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.darkBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stripText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.darkBgText,
    letterSpacing: 0.7,
  },
  body: {
    padding: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 42,
    lineHeight: 38,
    letterSpacing: -1.8,
    color: colors.text,
    marginBottom: spacing.md,
  },
  inputShadow: {
    alignSelf: 'stretch',
  },
  input: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: radii.inner,
    borderWidth: borders.thick,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  counter: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: colors.textSoft,
    textAlign: 'right',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    alignSelf: 'stretch',
  },
});

export default CreateHabitModal;
