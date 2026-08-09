export type VoiceDraftSignal =
  | 'delay'
  | 'material'
  | 'extraWork'
  | 'safety';

export interface StructuredVoiceDraft {
  transcript: string;
  workDescription: string;
  workerCount?: number;
  note?: string;
  signals: VoiceDraftSignal[];
}

export interface DiaryVoiceFields {
  workDescription: string;
  workerCount: number;
  note: string;
}

const spokenNumbers: Record<string, number> = {
  jeden: 1,
  jedna: 1,
  jedno: 1,
  dvaja: 2,
  dve: 2,
  dva: 2,
  traja: 3,
  tri: 3,
  štyria: 4,
  štyri: 4,
  päť: 5,
  šesť: 6,
  sedem: 7,
  osem: 8,
  deväť: 9,
  desať: 10,
  jedenásť: 11,
  dvanásť: 12,
  trinásť: 13,
  štrnásť: 14,
  pätnásť: 15,
  šestnásť: 16,
  sedemnásť: 17,
  osemnásť: 18,
  devätnásť: 19,
  dvadsať: 20,
};
const spokenNumberAlternation = Object.keys(spokenNumbers)
  .sort((left, right) => right.length - left.length)
  .join('|');
const countToken = `(?:\\d{1,2}|${spokenNumberAlternation})`;
const workerPatterns = [
  new RegExp(
    `(${countToken})\\s+(?:pracovník(?:ov|mi)?|robotník(?:ov|mi)?|ľudí|osôb|murár(?:ov|mi)?|tesár(?:ov|mi)?)`,
    'iu',
  ),
  new RegExp(
    `(?:pracovalo|robilo|pracovali|robili|bolo\\s+nás|na\\s+stavbe\\s+bolo)\\s+(${countToken})`,
    'iu',
  ),
];
const signalPatterns: Record<VoiceDraftSignal, RegExp> = {
  delay:
    /\b(zdrž\w*|mešk\w*|prestoj\w*|čakal\w*|čakan\w*|kvôli|pre\s+dážď|dážď\w*|nepriš\w*|výpadok\w*)\b/iu,
  material:
    /\b(materiál\w*|betón\w*|tehl\w*|cement\w*|výstuž\w*|izoláci\w*|sadrokartón\w*|omietk\w*|dodávk\w*)\b/iu,
  extraWork:
    /\b(navyše|naviac|viacprác\w*|dodatoč\w*|mimo\s+rozpočtu|zmena\s+rozsahu)\b/iu,
  safety:
    /\b(úraz\w*|nebezpeč\w*|bozp|bezpečnosť\w*|ochrann\w*|incident\w*)\b/iu,
};

function normalizeTranscript(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseCountToken(value: string): number | undefined {
  const normalized = value.toLocaleLowerCase('sk-SK');
  const parsed = /^\d+$/.test(normalized)
    ? Number(normalized)
    : spokenNumbers[normalized];
  return parsed !== undefined && parsed >= 1 && parsed <= 99
    ? parsed
    : undefined;
}

function workerCountFromTranscript(transcript: string): number | undefined {
  for (const pattern of workerPatterns) {
    const match = pattern.exec(transcript);
    const count = match?.[1] ? parseCountToken(match[1]) : undefined;
    if (count !== undefined) return count;
  }
  return undefined;
}

function transcriptSentences(transcript: string): string[] {
  return (transcript.match(/[^.!?…]+[.!?…]?/gu) ?? [])
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

export function appendVoiceTranscript(
  existing: string,
  transcript: string,
  maxLength = 500,
): string {
  const base = existing.replace(/\s+/g, ' ').trim();
  const spoken = transcript.replace(/\s+/g, ' ').trim();
  if (!spoken) return base;
  const separator = base ? (/[.!?…:]$/.test(base) ? ' ' : '. ') : '';
  const combined = `${base}${separator}${spoken}`;
  if (combined.length <= maxLength) return combined;
  return combined.slice(0, maxLength).trimEnd();
}

export function createStructuredVoiceDraft(
  transcript: string,
): StructuredVoiceDraft | undefined {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return undefined;
  const signals = (Object.keys(signalPatterns) as VoiceDraftSignal[]).filter(
    signal => signalPatterns[signal].test(normalized),
  );
  const noteSignals = new Set<VoiceDraftSignal>([
    'delay',
    'extraWork',
    'safety',
  ]);
  const noteSentences = transcriptSentences(normalized).filter(sentence =>
    signals.some(
      signal => noteSignals.has(signal) && signalPatterns[signal].test(sentence),
    ),
  );
  return {
    transcript: normalized,
    workDescription: normalized,
    workerCount: workerCountFromTranscript(normalized),
    note: noteSentences.length
      ? Array.from(new Set(noteSentences)).join(' ')
      : undefined,
    signals,
  };
}

export function applyStructuredVoiceDraft(
  current: DiaryVoiceFields,
  draft: StructuredVoiceDraft,
): DiaryVoiceFields {
  return {
    workDescription: appendVoiceTranscript(
      current.workDescription,
      draft.workDescription,
      500,
    ),
    workerCount: draft.workerCount ?? current.workerCount,
    note: draft.note
      ? appendVoiceTranscript(current.note, draft.note, 300)
      : current.note.trim(),
  };
}

export function voiceErrorKey(error: string): string {
  if (error === 'not-allowed') return 'voice.permissionDenied';
  if (error === 'service-not-allowed' || error === 'language-not-supported')
    return 'voice.unavailable';
  if (error === 'network') return 'voice.network';
  if (error === 'no-speech' || error === 'speech-timeout')
    return 'voice.noSpeech';
  return 'voice.failed';
}
