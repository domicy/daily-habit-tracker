/**
 * Turn a failed /auth request into something worth showing a user.
 *
 * These two screens are the only way into the app now that the shared-secret
 * token path is retired (#125), so "nothing happened" is not an acceptable
 * answer to a failed sign-in — the user cannot otherwise tell a typo from an
 * outage. See #131.
 */

interface AuthErrorShape {
  message?: string;
  code?: string;
  request?: unknown;
  response?: {status?: number; data?: {detail?: unknown}};
}

const UNREACHABLE =
  'Could not reach the server. Check your connection and try again.';
const GENERIC = 'Something went wrong. Please try again.';

/**
 * FastAPI sends `detail` as a string for explicit HTTPExceptions, but as a list
 * of error objects for request-validation failures (422) — e.g. a password
 * shorter than the 8-character minimum. Rendering the list verbatim would show
 * the user a lump of JSON.
 */
function detailToMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const first = detail.find(
      (entry): entry is {msg: string} =>
        typeof entry === 'object' && entry !== null && typeof (entry as {msg?: unknown}).msg === 'string',
    );
    if (first) {
      return first.msg;
    }
  }
  return null;
}

export function authErrorMessage(error: unknown): string {
  const err = (error ?? {}) as AuthErrorShape;

  // No response at all: DNS, timeout, tunnel down, aeroplane mode.
  if (!err.response) {
    return UNREACHABLE;
  }

  const fromDetail = detailToMessage(err.response.data?.detail);
  if (fromDetail) {
    return fromDetail;
  }

  const status = err.response.status ?? 0;
  if (status === 401) {
    return 'Invalid email or password.';
  }
  if (status === 409) {
    return 'That email or username is already registered.';
  }
  if (status >= 500) {
    return 'The server is having trouble. Please try again shortly.';
  }
  return GENERIC;
}
