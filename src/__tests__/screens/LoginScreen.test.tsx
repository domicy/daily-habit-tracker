import React from 'react';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import {LoginScreen} from '../../screens/LoginScreen';
import {RegisterScreen} from '../../screens/RegisterScreen';
import apiClient from '../../services/api';
import {useAuth} from '../../context/AuthContext';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {post: jest.fn()},
  API_BASE_URL: 'https://example.invalid',
  AUTH_TOKEN_KEY: 'auth_token',
}));
jest.mock('../../context/AuthContext', () => ({useAuth: jest.fn()}));

const navigate = jest.fn();
const navigation = {navigate} as never;
const route = {key: 'k', name: 'Login'} as never;

describe('auth screens', () => {
  const login = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({login});
  });

  // These two screens are the only way into the app now that the shared-secret
  // token endpoint is retired (#125), so the token they hand to AuthContext is
  // what every later request is scoped by, and a failure has to say so out loud
  // rather than doing nothing (#131).
  it('signs in and hands the returned token to AuthContext', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {access_token: 'jwt-for-real-account', token_type: 'bearer'},
    });

    const {getByPlaceholderText, getByText} = render(
      <LoginScreen navigation={navigation} route={route} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'correct horse');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });

    expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
      email: 'me@example.com',
      password: 'correct horse',
    });
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('jwt-for-real-account');
    });
  });

  it('registers and hands the returned token to AuthContext', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {access_token: 'jwt-for-new-account', token_type: 'bearer'},
    });

    const {getByPlaceholderText, getByText} = render(
      <RegisterScreen navigation={navigation} route={route} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'new@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'correct horse');
    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });

    expect(apiClient.post).toHaveBeenCalledWith('/auth/register', {
      email: 'new@example.com',
      password: 'correct horse',
    });
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('jwt-for-new-account');
    });
  });

  it('offers navigation between sign-in and registration', () => {
    const {getByText} = render(<LoginScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Need an account? Register'));
    expect(navigate).toHaveBeenCalledWith('Register');
  });

  it('tells the user when the credentials are rejected, and keeps their email', async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: {status: 401, data: {detail: 'Invalid email or password'}},
    });

    const {getByPlaceholderText, getByTestId, getByText} = render(
      <LoginScreen navigation={navigation} route={route} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong horse');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });

    await waitFor(() => {
      expect(getByTestId('login-error').props.children).toBe('Invalid email or password');
    });
    expect(login).not.toHaveBeenCalled();
    // Retyping the email after every failed attempt is its own small cruelty.
    expect(getByPlaceholderText('Email').props.value).toBe('me@example.com');
  });

  it('distinguishes an unreachable server from a rejected credential', async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({message: 'Network Error'});

    const {getByPlaceholderText, getByTestId, getByText} = render(
      <LoginScreen navigation={navigation} route={route} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'correct horse');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });

    await waitFor(() => {
      expect(getByTestId('login-error').props.children).toMatch(/Could not reach the server/);
    });
  });

  it('clears a previous error when the user tries again', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: {status: 401, data: {detail: 'Invalid email or password'}},
    });

    const {getByPlaceholderText, queryByTestId, getByText} = render(
      <LoginScreen navigation={navigation} route={route} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong horse');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });
    await waitFor(() => expect(queryByTestId('login-error')).toBeTruthy());

    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {access_token: 'jwt-after-retry', token_type: 'bearer'},
    });
    fireEvent.changeText(getByPlaceholderText('Password'), 'correct horse');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('jwt-after-retry');
    });
    expect(queryByTestId('login-error')).toBeNull();
  });

  it('surfaces a duplicate-account rejection on register', async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: {status: 409, data: {detail: 'Email already registered'}},
    });

    const {getByPlaceholderText, getByTestId, getByText} = render(
      <RegisterScreen navigation={navigation} route={route} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'taken@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'correct horse');
    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });

    await waitFor(() => {
      expect(getByTestId('register-error').props.children).toBe('Email already registered');
    });
    expect(login).not.toHaveBeenCalled();
  });

  it('renders a validation failure as a sentence, not raw JSON', async () => {
    // FastAPI returns `detail` as a list of objects for a 422 — e.g. a password
    // under the 8-character minimum on RegisterRequest.
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: {
        status: 422,
        data: {
          detail: [
            {loc: ['body', 'password'], msg: 'String should have at least 8 characters', type: 'too_short'},
          ],
        },
      },
    });

    const {getByPlaceholderText, getByTestId, getByText} = render(
      <RegisterScreen navigation={navigation} route={route} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'new@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'short');
    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });

    await waitFor(() => {
      expect(getByTestId('register-error').props.children).toBe(
        'String should have at least 8 characters',
      );
    });
  });

  it('ignores a second press while a sign-in is already in flight', async () => {
    let release: (value: unknown) => void = () => {};
    (apiClient.post as jest.Mock).mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      }),
    );

    const {getByPlaceholderText, getByText} = render(
      <LoginScreen navigation={navigation} route={route} />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'correct horse');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
      fireEvent.press(getByText('Sign In'));
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({data: {access_token: 'jwt', token_type: 'bearer'}});
    });
  });
});
