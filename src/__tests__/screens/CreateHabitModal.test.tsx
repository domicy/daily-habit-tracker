import React from 'react';
import {render, fireEvent, act} from '@testing-library/react-native';
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

    expect(service.createHabit).toHaveBeenCalledWith('Drink Water');
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
});
