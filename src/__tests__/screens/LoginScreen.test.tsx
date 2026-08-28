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
  // what every later request is scoped by. The rejecting path is deliberately
  // not covered here: neither screen handles it today, and a test would have to
  // encode that silence as correct. Tracked in #131.
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
});
