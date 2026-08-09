import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { Card, EmptyState, PrimaryButton, ScreenShell, TextArea, TextField, TopBar } from '@/components/ui';
import { localDateIso } from '@/domain/ids';
import { validateSafetyBriefing } from '@/domain/safetyBriefings';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { colors, spacing } from '@/theme/tokens';

export function SafetyBriefingEditorScreen({ navigation, route }: { navigation: any; route: { params?: { briefingId?: string } } }) {
  const { selectedProject, state, saveSafetyBriefing } = useApp(); const existing = state.safetyBriefings.find(item => item.id === route.params?.briefingId);
  const [title, setTitle] = useState(existing?.title ?? ''); const [body, setBody] = useState(existing?.body ?? ''); const [date, setDate] = useState(existing?.briefingDate ?? localDateIso()); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (!selectedProject) return <ScreenShell><TopBar title={t('safetyBriefings.create')} onBack={() => navigation.goBack()} /><EmptyState title={t('projects.noProjects')} /></ScreenShell>;
  if (existing && existing.status !== 'draft') return <ScreenShell><TopBar title={existing.title} onBack={() => navigation.goBack()} /><EmptyState title={t('safetyBriefings.immutable')} /></ScreenShell>;
  const save = async () => { const validation = validateSafetyBriefing({ title, body, briefingDate: date }); if (validation !== 'ok') { setError(t(validation === 'title' ? 'safetyBriefings.validationTitle' : validation === 'body' ? 'safetyBriefings.validationBody' : 'safetyBriefings.validationDate')); return; } setBusy(true); try { await saveSafetyBriefing({ id: existing?.id, projectId: selectedProject.id, title, body, briefingDate: date }); navigation.goBack(); } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); } };
  return <ScreenShell><TopBar title={existing ? t('safetyBriefings.edit') : t('safetyBriefings.create')} onBack={() => navigation.goBack()} /><Card style={styles.form}><TextField label={t('safetyBriefings.titleLabel')} value={title} onChangeText={setTitle} placeholder={t('safetyBriefings.titlePlaceholder')} maxLength={160} /><TextField label={t('safetyBriefings.date')} value={date} onChangeText={setDate} placeholder="2026-08-01" /><TextArea label={t('safetyBriefings.bodyLabel')} value={body} onChangeText={setBody} placeholder={t('safetyBriefings.bodyPlaceholder')} maxLength={4000} />{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton title={t('safetyBriefings.save')} icon={Check} disabled={busy} onPress={() => void save()} /></Card></ScreenShell>;
}
const styles = StyleSheet.create({ form: { borderTopWidth: 5, borderTopColor: '#C8A96B' }, error: { color: colors.danger, fontSize: 12, fontWeight: '700' } });
