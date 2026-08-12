export type AuthMode = 'signin' | 'signup' | 'reset';

type AuthFailure = {
  code?: string;
  message?: string;
  status?: number;
};

export function authErrorTranslationKey(error: unknown, mode: AuthMode): string {
  if (error instanceof Error && error.message === 'AUTH_CONFIG_MISSING') return 'errors.config';

  const failure = error && typeof error === 'object' ? (error as AuthFailure) : {};
  const code = failure.code?.toLowerCase() ?? '';
  const message = failure.message?.toLowerCase() ?? '';

  if (code === 'email_address_invalid' || message.includes('invalid email')) return 'errors.invalidEmail';
  if (code === 'weak_password' || message.includes('password should be')) return 'errors.weakPassword';
  if (code === 'email_not_confirmed') return 'errors.emailNotConfirmed';
  if (code === 'invalid_credentials') return 'errors.invalidCredentials';
  if (code === 'user_already_exists' || code === 'email_exists') return 'errors.accountExists';
  if (code === 'signup_disabled') return 'errors.signupDisabled';
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    failure.status === 429 ||
    message.includes('rate limit')
  ) return 'errors.authRateLimit';

  if (mode === 'signup') return 'errors.signUp';
  if (mode === 'reset') return 'errors.resetPassword';
  return 'errors.auth';
}
