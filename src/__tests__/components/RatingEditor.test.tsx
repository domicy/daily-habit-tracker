import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import RatingEditor, {type HabitRatings} from '../../components/RatingEditor';

// Mock the database import to avoid SQLite initialization in tests
jest.mock('../../models', () => ({}));

const RATINGS: HabitRatings = {impact: 3, friction: 3, keystone: 3, timeCost: 3};

function renderEditor(
  overrides: Partial<HabitRatings> = {},
  onSave = jest.fn().mockResolvedValue(undefined),
) {
  const ratings = {...RATINGS, ...overrides};
  return {onSave, ...render(<RatingEditor ratings={ratings} onSave={onSave} />)};
}

describe('RatingEditor', () => {
  it('renders a control for every rating field at its current value', () => {
    const {getByTestId, getByText} = renderEditor({impact: 5, timeCost: 1});

    expect(getByText('RATE THIS HABIT')).toBeTruthy();
    expect(getByTestId('rating-impact').props.children).toBe(5);
    expect(getByTestId('rating-friction').props.children).toBe(3);
    expect(getByTestId('rating-keystone').props.children).toBe(3);
    expect(getByTestId('rating-timeCost').props.children).toBe(1);
  });

  it('increments and decrements a field', () => {
    const {getByLabelText, getByTestId} = renderEditor();

    fireEvent.press(getByLabelText('Increase impact'));
    expect(getByTestId('rating-impact').props.children).toBe(4);

    fireEvent.press(getByLabelText('Decrease impact'));
    fireEvent.press(getByLabelText('Decrease impact'));
    expect(getByTestId('rating-impact').props.children).toBe(2);
  });

  it('clamps at the ends of the 1-5 range', () => {
    const {getByLabelText, getByTestId} = renderEditor({impact: 5, friction: 1});

    // The controls at the boundary are disabled, so the value cannot leave 1-5.
    expect(getByLabelText('Increase impact').props.accessibilityState?.disabled).toBe(true);
    expect(getByLabelText('Decrease friction').props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(getByLabelText('Increase impact'));
    fireEvent.press(getByLabelText('Decrease friction'));
    expect(getByTestId('rating-impact').props.children).toBe(5);
    expect(getByTestId('rating-friction').props.children).toBe(1);
  });

  it('saves the edited draft rather than the original ratings', async () => {
    const {getByLabelText, onSave} = renderEditor();

    fireEvent.press(getByLabelText('Increase keystone'));
    await act(async () => {
      fireEvent.press(getByLabelText('Save habit ratings'));
    });

    expect(onSave).toHaveBeenCalledWith({
      impact: 3,
      friction: 3,
      keystone: 4,
      timeCost: 3,
    });
  });

  it('shows a saving state while the save is in flight', async () => {
    let release: () => void = () => {};
    const onSave = jest.fn(
      () => new Promise<void>(resolve => {
        release = resolve;
      }),
    );
    const {getByLabelText, getByText} = renderEditor({}, onSave);

    fireEvent.press(getByLabelText('Save habit ratings'));

    expect(getByText('SAVING…')).toBeTruthy();
    // Controls are locked so a second tap cannot double-submit.
    expect(getByLabelText('Increase impact').props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      release();
    });
    await waitFor(() => expect(getByText('SAVE RATINGS')).toBeTruthy());
  });

  it('adopts new ratings arriving from props', () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const {getByTestId, rerender} = render(
      <RatingEditor ratings={RATINGS} onSave={onSave} />,
    );

    rerender(<RatingEditor ratings={{...RATINGS, impact: 1}} onSave={onSave} />);

    expect(getByTestId('rating-impact').props.children).toBe(1);
  });
});
