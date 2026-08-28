// src/screens/LoginScreen.tsx
import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import apiClient from '../services/api';
import {authErrorMessage} from '../utils/authError';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';

type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A ref, not the state above: two taps in the same frame both read the same
  // closure before React re-renders, so `submitting` is still false for the
  // second one and `disabled` has not taken effect yet. Same reason
  // SyncService guards with `inFlight`.
  const inFlight = useRef(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const response = await apiClient.post('/auth/login', {email, password});
      await login(response.data.access_token);
    } catch (err: unknown) {
      // The email is deliberately left in place so a rejected attempt does not
      // cost the user their typing.
      setError(authErrorMessage(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error && (
        <Text style={styles.error} testID="login-error">
          {error}
        </Text>
      )}
      <Button title="Sign In" onPress={handleLogin} disabled={submitting} />
      <Button
        title="Need an account? Register"
        onPress={() => navigation.navigate('Register')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginBottom: 12 },
  error: { color: '#b00020', marginBottom: 12, textAlign: 'center' },
});
