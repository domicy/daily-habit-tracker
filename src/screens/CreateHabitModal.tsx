import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import {colors} from '../theme/colors';
import {fontFamily, typeScale} from '../theme/typography';
import {spacing} from '../theme/spacing';
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
      <View style={styles.container}>
        <Text style={styles.title}>New Habit</Text>

        <TextInput
          style={styles.input}
          placeholder="e.g., Drink Water, Read 10 Pages"
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={setName}
          maxLength={MAX_LENGTH}
          autoFocus
          testID="habit-name-input"
          accessibilityLabel="Habit name"
        />

        <Text style={styles.counter} testID="char-counter">
          {name.length}/{MAX_LENGTH}
        </Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            testID="cancel-button">
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.createButton, !isValid && styles.createButtonDisabled]}
            onPress={handleCreate}
            disabled={!isValid || creating}
            testID="create-button">
            <Text
              style={[
                styles.createButtonText,
                !isValid && styles.createButtonTextDisabled,
              ]}>
              Create
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  container: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.heading,
    ...typeScale.h2,
    color: colors.clemsonOrange,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  input: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  counter: {
    fontFamily: fontFamily.body,
    ...typeScale.caption,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: fontFamily.body,
    ...typeScale.body,
    color: colors.textSecondary,
  },
  createButton: {
    flex: 1,
    marginLeft: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.clemsonOrange,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: colors.border,
  },
  createButtonText: {
    fontFamily: fontFamily.heading,
    ...typeScale.body,
    color: colors.textPrimary,
  },
  createButtonTextDisabled: {
    color: colors.textSecondary,
  },
});

export default CreateHabitModal;
