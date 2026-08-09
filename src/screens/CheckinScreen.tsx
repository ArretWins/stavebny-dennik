import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CheckCircle2, Copy, QrCode as QrIcon, Users } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { ScreenShell, TopBar, Card, SecondaryButton, TextField, PrimaryButton, EmptyState } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { formatTime } from '@/i18n/format';
import { t } from '@/i18n';
import { createCheckinToken, validateCheckinToken } from '@/domain/qr';
import { createId, localDateIso, nowIso } from '@/domain/ids';
import { useApp } from '@/state/app';
import { supabase } from '@/services/supabase';

export function CheckinScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state } = useApp(); const today = localDateIso(); const [copied, setCopied] = useState(false); const [token, setToken] = useState('');
  const fallbackToken = useMemo(() => selectedProject ? createCheckinToken({ projectId: selectedProject.id, ownerId: selectedProject.ownerId, date: today, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), action: 'checkin', nonce: createId('token') }) : '', [selectedProject?.id, selectedProject?.ownerId, today]);
  useEffect(() => { let active = true; if (!selectedProject) return; if (!supabase) { setToken(fallbackToken); return; } void supabase.rpc('create_checkin_token', { p_project_id: selectedProject.id, p_date: today }).then(({ data }) => { if (active && typeof data === 'string') setToken(data); else if (active) setToken(fallbackToken); }); return () => { active = false; }; }, [fallbackToken, selectedProject?.id, today]);
  if (!selectedProject) return <ScreenShell><EmptyState title={t('projects.noProjects')} /></ScreenShell>;
  const publicBase = process.env.EXPO_PUBLIC_CHECKIN_PUBLIC_URL || (process.env.EXPO_PUBLIC_SUPABASE_URL ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/worker-checkin` : 'stavebnydennik://checkin'); const link = `${publicBase}?token=${encodeURIComponent(token)}`; const workers = state.workerCheckins.filter(item => item.projectId === selectedProject.id && item.checkedInAt.startsWith(today));
  return <ScreenShell><TopBar title={t('checkin.title')} onBack={() => navigation.goBack()} /><Card style={styles.center}><Text style={styles.heading}>{selectedProject.name}</Text><Text style={styles.hint}>{t('checkin.shareHint')}</Text><View style={styles.qr}>{token ? <QRCode value={link} size={210} backgroundColor={colors.surface} color={colors.text} /> : null}</View><Text style={styles.expiry}>{t('checkin.tokenExpires', { time: formatTime(Date.now() + 12 * 60 * 60 * 1000) })}</Text><SecondaryButton title={copied ? t('app.save') : t('checkin.copyLink')} icon={Copy} onPress={() => { void Clipboard.setStringAsync(link); setCopied(true); }} /><SecondaryButton title={t('checkin.link')} onPress={() => void Linking.openURL(link)} /></Card><Card><View style={styles.summary}><Users color={colors.primary} size={25} /><Text style={styles.heading}>{t('checkin.todaySummary')}</Text></View>{workers.length ? workers.map(worker => <Text style={styles.worker} key={worker.id}><CheckCircle2 color={colors.primary} size={16} /> {worker.workerName}</Text>) : <Text style={styles.hint}>{t('checkin.noWorkers')}</Text>}</Card></ScreenShell>;
}

export function PublicCheckinScreen({ route }: { route: { params?: { token?: string } } }) {
  const { addCheckin } = useApp(); const token = route.params?.token ?? ''; const [name, setName] = useState(''); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  const submit = async () => { if (!token || !name.trim()) { setError(!token ? t('checkin.invalidToken') : t('checkin.workerName')); return; } try { if (supabase) { const { error: functionError } = await supabase.functions.invoke('worker-checkin', { body: { token, workerName: name.trim() } }); if (functionError) throw functionError; } else { const decoded = token.startsWith('sd1.') ? validateCheckinToken(token, { projectId: (() => { try { return JSON.parse(atob(token.slice(4))).projectId; } catch { return ''; } })() }) : { valid: false as const, reason: 'malformed' as const }; if (!decoded.valid) { setError(t('checkin.invalidToken')); return; } await addCheckin({ id: createId('checkin'), projectId: decoded.payload.projectId, workerName: name.trim(), checkedInAt: nowIso() }); } setDone(true); } catch { setError(t('errors.generic')); } };
  if (done) return <ScreenShell scroll={false} style={styles.public}><Card style={styles.center}><CheckCircle2 color={colors.primary} size={56} /><Text style={styles.heading}>{t('checkin.confirmed')}</Text></Card></ScreenShell>;
  return <ScreenShell scroll={false} style={styles.public}><Card><Text style={styles.heading}>{t('checkin.publicTitle')}</Text><TextField label={t('checkin.workerName')} value={name} onChangeText={setName} placeholder={t('checkin.workerNamePlaceholder')} autoFocus /><PrimaryButton title={t('checkin.confirm')} icon={CheckCircle2} onPress={() => void submit()} />{error ? <Text style={styles.error}>{error}</Text> : null}</Card></ScreenShell>;
}
const styles = StyleSheet.create({ public: { justifyContent: 'center' }, center: { alignItems: 'center' }, heading: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }, hint: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }, qr: { padding: spacing.lg, marginVertical: spacing.md, backgroundColor: colors.surface }, expiry: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }, summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, worker: { color: colors.text, fontSize: 15, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, error: { color: colors.danger, fontSize: 13 } });
