import React from 'react';
import {render, fireEvent, act, waitFor} from '@testing-library/react-native';
import CreateHabitModal from '../../screens/CreateHabitModal';
import HabitService from '../../services/HabitService';

// Mock the database import to avoid SQLite initialization in tests
jest.mock('../../models', () => ({}));

function createMockHabitService() {
  return {
    createHabit: jest.fn().mockResolvedValue({id: 'new-1', name: 'Test'}),
    getActiveHabits: jest.fn(),
    getAllHabits: jest.fn(),
    toggleHabitActive: jest.fn(),
    toggleHabitCompletion: jest.fn(),
    calculateStreak: jest.fn(),
    getLogsForHabit: jest.fn(),
    getUnsyncedLogs: jest.fn(),
    getHabitById: jest.fn(),
  } as unknown as jest.Mocked<HabitService>;
}

describe('CreateHabitModal', () => {
  it('disables Create button when input is empty', () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};

    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    const createButton = getByTestId('create-button');
    expect(createButton.props.accessibilityState?.disabled).toBe(true);
  });

  it('disables Create button when input is whitespace-only', () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};

    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    fireEvent.changeText(getByTestId('habit-name-input'), '   ');

    const createButton = getByTestId('create-button');
    expect(createButton.props.accessibilityState?.disabled).toBe(true);
  });

  it('calls createHabit with trimmed name on Create press', async () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};

    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    fireEvent.changeText(getByTestId('habit-name-input'), '  Drink Water  ');

    await act(async () => {
      fireEvent.press(getByTestId('create-button'));
    });

    expect(service.createHabit).toHaveBeenCalledWith('Drink Water', {
      impact: 3,
      friction: 3,
      keystone: 3,
      timeCost: 3,
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('enforces max length of 50 characters', () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};

    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    const input = getByTestId('habit-name-input');
    // maxLength is set on the TextInput — verify the prop
    expect(input.props.maxLength).toBe(50);
  });

  it('shows live character counter', () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};

    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    expect(getByTestId('char-counter').props.children).toEqual([
      0,
      '/',
      50,
    ]);

    fireEvent.changeText(getByTestId('habit-name-input'), 'Hello');

    expect(getByTestId('char-counter').props.children).toEqual([
      5,
      '/',
      50,
    ]);
  });

  it('dismisses modal without creating when Cancel is pressed', () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};

    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    fireEvent.press(getByTestId('cancel-button'));

    expect(navigation.goBack).toHaveBeenCalled();
    expect(service.createHabit).not.toHaveBeenCalled();
  });

  it('enables Create button when valid text is entered', () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};

    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    fireEvent.changeText(getByTestId('habit-name-input'), 'Read 10 Pages');

    const createButton = getByTestId('create-button');
    expect(createButton.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('has correct placeholder text', () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};

    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    const input = getByTestId('habit-name-input');
    expect(input.props.placeholder).toBe(
      'e.g., Drink Water, Read 10 Pages',
    );
  });

  // ─── Ratings on create (#115) ──────────────────────────────────────

  it('exposes all four rating controls at the neutral default', async () => {
    const service = createMockHabitService();
    const {getByTestId} = render(<CreateHabitModal habitService={service} />);

    expect(getByTestId('rating-editor')).toBeTruthy();
    expect(getByTestId('rating-impact').props.children).toBe(3);
    expect(getByTestId('rating-friction').props.children).toBe(3);
    expect(getByTestId('rating-keystone').props.children).toBe(3);
    expect(getByTestId('rating-timeCost').props.children).toBe(3);
  });

  it('creates the habit with the ratings the user chose', async () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};
    const {getByTestId, getByLabelText} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    fireEvent.changeText(getByTestId('habit-name-input'), 'Read');
    fireEvent.press(getByLabelText('Increase impact'));
    fireEvent.press(getByLabelText('Increase impact'));
    fireEvent.press(getByLabelText('Decrease friction'));

    await act(async () => {
      fireEvent.press(getByTestId('create-button'));
    });

    expect(service.createHabit).toHaveBeenCalledWith('Read', {
      impact: 5,
      friction: 2,
      keystone: 3,
      timeCost: 3,
    });
  });

  it('shows an error instead of silently swallowing a failed create', async () => {
    const service = createMockHabitService();
    const navigation = {goBack: jest.fn()};
    (service.createHabit as jest.Mock).mockRejectedValue(
      new Error('Habit name must be 50 characters or fewer.'),
    );
    const {getByTestId} = render(
      <CreateHabitModal habitService={service} navigation={navigation} />,
    );

    fireEvent.changeText(getByTestId('habit-name-input'), 'Read');
    await act(async () => {
      fireEvent.press(getByTestId('create-button'));
    });

    await waitFor(() =>
      expect(getByTestId('create-habit-error').props.children).toBe(
        'Habit name must be 50 characters or fewer.',
      ),
    );
    // The modal stays open so the user can correct and retry.
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
