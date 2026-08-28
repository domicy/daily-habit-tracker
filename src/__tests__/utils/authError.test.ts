import {authErrorMessage} from '../../utils/authError';

describe('authErrorMessage', () => {
  it('prefers the server-supplied reason', () => {
    expect(
      authErrorMessage({response: {status: 401, data: {detail: 'Invalid email or password'}}}),
    ).toBe('Invalid email or password');
  });

  it('takes the first message out of a FastAPI validation list', () => {
    expect(
      authErrorMessage({
        response: {
          status: 422,
          data: {detail: [{loc: ['body', 'password'], msg: 'String should have at least 8 characters'}]},
        },
      }),
    ).toBe('String should have at least 8 characters');
  });

  it.each([
    ['no response at all', {message: 'Network Error'}, /Could not reach the server/],
    ['a 401 with no detail', {response: {status: 401, data: {}}}, /Invalid email or password/],
    ['a 409 with no detail', {response: {status: 409, data: {}}}, /already registered/],
    ['a 500 with no detail', {response: {status: 503, data: {}}}, /server is having trouble/],
    ['an unmapped status', {response: {status: 418, data: {}}}, /Something went wrong/],
  ])('falls back to a sentence for %s', (_label, error, expected) => {
    expect(authErrorMessage(error)).toMatch(expected);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a blank detail', {response: {status: 400, data: {detail: '   '}}}],
    ['an unusable detail list', {response: {status: 422, data: {detail: [{loc: ['body']}]}}}],
  ])('never renders %s as an empty message', (_label, error) => {
    expect(authErrorMessage(error).length).toBeGreaterThan(0);
  });
});
