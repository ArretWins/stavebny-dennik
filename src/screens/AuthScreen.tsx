import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { LogIn, UserPlus } from 'lucide-react-native';
import { ScreenShell, PrimaryButton, SecondaryButton, TextField, Card } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import { useAuth } from '@/state/auth';
import { authErrorTranslationKey } from '@/services/authError';

export function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setMessage('');
    if (!email.trim()) { setError(t('errors.emailRequired')); return; }
    if (mode !== 'reset' && password.length < 6) { setError(t('errors.passwordShort')); return; }
    if (mode === 'signup' && password !== confirm) { setError(t('errors.passwordMismatch')); return; }
    setBusy(true);
    try {
      if (mode === 'reset') { await resetPassword(email); setMessage(t('auth.resetSent')); }
      else if (mode === 'signup') {
        const result = await signUp(email, password);
        if (result === 'confirmation_required') {
          setMessage(t('auth.confirmationSent'));
          setMode('signin');
          setPassword('');
          setConfirm('');
        }
      }
      else await signIn(email, password);
    } catch (submitError) {
      setError(t(authErrorTranslationKey(submitError, mode)));
    }
    finally { setBusy(false); }
  };

  return (
    <ScreenShell scroll={false} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <View style={styles.logo}><Image source={require('../../assets/adaptive-icon.png')} style={styles.logoMark} resizeMode="contain" /></View>
        <Text style={styles.title}>{t('auth.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
        <Card style={styles.form}>
          <TextField label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          {mode !== 'reset' ? <TextField label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" /> : null}
          {mode === 'signup' ? <TextField label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <PrimaryButton title={mode === 'signin' ? t('auth.signIn') : mode === 'signup' ? t('auth.signUp') : t('auth.resetPassword')} icon={mode === 'signup' ? UserPlus : LogIn} onPress={submit} disabled={busy} />
          {mode === 'signin' ? <>
            <SecondaryButton title={t('auth.createAccount')} onPress={() => setMode('signup')} />
            <Text style={styles.link} onPress={() => setMode('reset')}>{t('auth.forgotPassword')}</Text>
          </> : <Text style={styles.link} onPress={() => setMode('signin')}>{t('auth.switchToSignIn')}</Text>}
        </Card>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surfaceAlt },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  logo: { alignSelf: 'center', width: 88, height: 88, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  logoMark: { width: 78, height: 78 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  form: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 13 },
  message: { color: colors.primaryDark, fontSize: 13 },
  link: { color: colors.primary, textAlign: 'center', padding: spacing.sm, fontSize: 14, fontWeight: '600' },
});
