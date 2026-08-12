import { describe, expect, it } from 'vitest';
import { authErrorTranslationKey } from '../src/services/authError';

describe('auth error messages', () => {
  it('shows actionable registration errors instead of a generic sign-in failure', () => {
    expect(authErrorTranslationKey({ code: 'email_address_invalid' }, 'signup')).toBe('errors.invalidEmail');
    expect(authErrorTranslationKey({ code: 'weak_password' }, 'signup')).toBe('errors.weakPassword');
    expect(authErrorTranslationKey({ code: 'over_email_send_rate_limit', status: 429 }, 'signup')).toBe('errors.authRateLimit');
    expect(authErrorTranslationKey({ code: 'unexpected' }, 'signup')).toBe('errors.signUp');
  });

  it('distinguishes sign-in and confirmation failures', () => {
    expect(authErrorTranslationKey({ code: 'invalid_credentials' }, 'signin')).toBe('errors.invalidCredentials');
    expect(authErrorTranslationKey({ code: 'email_not_confirmed' }, 'signin')).toBe('errors.emailNotConfirmed');
    expect(authErrorTranslationKey(new Error('AUTH_CONFIG_MISSING'), 'signin')).toBe('errors.config');
  });
});
