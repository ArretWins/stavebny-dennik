import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Mic, RotateCcw, Square } from 'lucide-react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
  createStructuredVoiceDraft,
  voiceErrorKey,
  type StructuredVoiceDraft,
} from '@/domain/voiceDraft';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';

const constructionTerms = [
  'betón',
  'debnenie',
  'hydroizolácia',
  'murivo',
  'omietka',
  'sadrokartón',
  'výstuž',
  'základová doska',
];

export function VoiceDraftControl({
  onApply,
  onListeningChange,
}: {
  onApply: (draft: StructuredVoiceDraft) => void;
  onListeningChange?: (listening: boolean) => void;
}) {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState(t('voice.hint'));
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<StructuredVoiceDraft>();
  const listeningRef = useRef(false);
  const transcriptRef = useRef('');
  const draftReadyRef = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    listeningRef.current = true;
    setListening(true);
    onListeningChange?.(true);
    setStatus(t('voice.listening'));
  });
  useSpeechRecognitionEvent('end', () => {
    listeningRef.current = false;
    setListening(false);
    onListeningChange?.(false);
    if (!draftReadyRef.current && transcriptRef.current.trim()) {
      const nextDraft = createStructuredVoiceDraft(transcriptRef.current);
      setDraft(nextDraft);
      setStatus(nextDraft ? t('voice.reviewReady') : t('voice.noSpeech'));
      draftReadyRef.current = Boolean(nextDraft);
    }
  });
  useSpeechRecognitionEvent('result', (event) => {
    const nextTranscript = event.results[0]?.transcript ?? '';
    if (!nextTranscript.trim()) return;
    transcriptRef.current = nextTranscript;
    setTranscript(nextTranscript);
    if (!event.isFinal) {
      setStatus(t('voice.transcribing'));
      return;
    }
    const nextDraft = createStructuredVoiceDraft(nextTranscript);
    setDraft(nextDraft);
    setStatus(nextDraft ? t('voice.reviewReady') : t('voice.noSpeech'));
    draftReadyRef.current = Boolean(nextDraft);
  });
  useSpeechRecognitionEvent('nomatch', () => {
    setStatus(t('voice.noSpeech'));
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted') return;
    listeningRef.current = false;
    setListening(false);
    onListeningChange?.(false);
    setStatus(t(voiceErrorKey(event.error)));
  });

  useEffect(
    () => () => {
      if (listeningRef.current) ExpoSpeechRecognitionModule.abort();
      onListeningChange?.(false);
    },
    [],
  );

  const start = async () => {
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setStatus(t('voice.unavailable'));
        return;
      }
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setStatus(t('voice.permissionDenied'));
        return;
      }
      setDraft(undefined);
      setTranscript('');
      transcriptRef.current = '';
      draftReadyRef.current = false;
      setStatus(t('voice.starting'));
      ExpoSpeechRecognitionModule.start({
        lang: 'sk-SK',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
        contextualStrings: constructionTerms,
      });
    } catch {
      listeningRef.current = false;
      setListening(false);
      onListeningChange?.(false);
      setStatus(t('voice.failed'));
    }
  };

  return (
    <View style={styles.stack}>
      <View style={[styles.shell, listening && styles.shellListening]}>
        <View style={styles.marker}>
          <View style={[styles.dot, listening && styles.dotListening]} />
          <Text style={styles.markerText}>
            {listening ? t('voice.live') : t('voice.draftLabel')}
          </Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{t('voice.title')}</Text>
          <Text style={styles.status}>{status}</Text>
          {listening && transcript ? (
            <Text numberOfLines={2} style={styles.liveTranscript}>
              {transcript}
            </Text>
          ) : null}
          <Text style={styles.privacy}>{t('voice.privacy')}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            listening ? t('voice.stop') : t('voice.start')
          }
          onPress={() =>
            listening ? ExpoSpeechRecognitionModule.stop() : void start()
          }
          style={({ pressed }) => [
            styles.button,
            listening && styles.buttonListening,
            pressed && styles.pressed,
          ]}
        >
          {listening ? (
            <Square color={colors.surface} fill={colors.surface} size={18} />
          ) : (
            <Mic color={colors.surface} size={23} />
          )}
        </Pressable>
      </View>
      {draft ? (
        <View style={styles.review}>
          <View style={styles.reviewHeader}>
            <View style={styles.reviewNumber}>
              <Text style={styles.reviewNumberText}>1</Text>
            </View>
            <View style={styles.reviewHeading}>
              <Text style={styles.reviewTitle}>{t('voice.reviewTitle')}</Text>
              <Text style={styles.reviewHint}>{t('voice.reviewHint')}</Text>
            </View>
          </View>
          <Text style={styles.transcript}>{draft.transcript}</Text>
          <View style={styles.extracted}>
            <View style={styles.extractedRow}>
              <Text style={styles.extractedLabel}>{t('voice.extractedWork')}</Text>
              <Check color={colors.primary} size={17} />
            </View>
            <View style={styles.extractedRow}>
              <Text style={styles.extractedLabel}>
                {t('voice.extractedWorkers')}
              </Text>
              <Text
                style={[
                  styles.extractedValue,
                  draft.workerCount === undefined && styles.needsReview,
                ]}
              >
                {draft.workerCount ?? t('voice.notRecognized')}
              </Text>
            </View>
            {draft.signals.length ? (
              <View style={styles.signalRow}>
                {draft.signals.map(signal => (
                  <View style={styles.signalChip} key={signal}>
                    <Text style={styles.signalText}>
                      {t(`voice.signal.${signal}`)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.reviewActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('voice.discard')}
              onPress={() => {
                setDraft(undefined);
                setTranscript('');
                transcriptRef.current = '';
                draftReadyRef.current = false;
                setStatus(t('voice.hint'));
              }}
              style={({ pressed }) => [
                styles.reviewButton,
                styles.discardButton,
                pressed && styles.pressed,
              ]}
            >
              <RotateCcw color={colors.primary} size={18} />
              <Text style={styles.discardText}>{t('voice.discard')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('voice.apply')}
              onPress={() => {
                onApply(draft);
                setDraft(undefined);
                setTranscript('');
                transcriptRef.current = '';
                draftReadyRef.current = false;
                setStatus(t('voice.applied'));
              }}
              style={({ pressed }) => [
                styles.reviewButton,
                styles.applyButton,
                pressed && styles.pressed,
              ]}
            >
              <Check color={colors.surface} size={19} />
              <Text style={styles.applyText}>{t('voice.apply')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  shell: {
    minHeight: 126,
    borderWidth: 1,
    borderColor: '#C9B98F',
    borderRadius: radius.md,
    backgroundColor: '#F8F2E4',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  shellListening: { borderColor: colors.warning },
  marker: {
    width: 42,
    backgroundColor: '#23352F',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#9FB2AA',
  },
  dotListening: { backgroundColor: '#FFB23F' },
  markerText: {
    color: '#E6EFEA',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    transform: [{ rotate: '-90deg' }],
    width: 70,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  status: { color: colors.text, fontSize: 12, lineHeight: 17 },
  liveTranscript: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  privacy: { color: colors.textMuted, fontSize: 10, lineHeight: 14 },
  button: {
    width: 58,
    margin: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonListening: { backgroundColor: colors.warning },
  review: {
    borderWidth: 1,
    borderColor: '#B9D2B6',
    borderRadius: radius.md,
    backgroundColor: '#FBFEFA',
    padding: spacing.md,
    gap: spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reviewNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewNumberText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900',
  },
  reviewHeading: { flex: 1 },
  reviewTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  reviewHint: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  transcript: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
  },
  extracted: {
    backgroundColor: '#EEF5EC',
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  extractedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  extractedLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  extractedValue: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  needsReview: { color: colors.warning },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  signalChip: {
    borderRadius: 999,
    backgroundColor: '#E8DFC8',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  signalText: { color: '#674D18', fontSize: 9, fontWeight: '800' },
  reviewActions: { flexDirection: 'row', gap: spacing.sm },
  reviewButton: {
    minHeight: 48,
    flex: 1,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  discardButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  applyButton: { backgroundColor: colors.primary },
  discardText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  applyText: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.78 },
});
