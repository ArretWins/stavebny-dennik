import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Project, ProjectWorker, WorkShift } from '@/domain/types';
import { workShiftCsv } from '@/domain/workShifts';

export async function shareWorkShiftCsv(input: { project: Project; shifts: WorkShift[]; workers: ProjectWorker[]; dateFrom: string; dateTo: string }): Promise<string> {
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error('FILE_CACHE_UNAVAILABLE');
  const safeProject = input.project.name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'projekt';
  const uri = `${directory}tabulka-zmien-${safeProject}-${input.dateFrom}-${input.dateTo}.csv`;
  await FileSystem.writeAsStringAsync(uri, workShiftCsv({ projectName: input.project.name, shifts: input.shifts, workers: input.workers, dateFrom: input.dateFrom, dateTo: input.dateTo }), { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Zdieľať tabuľku zmien', UTI: 'public.comma-separated-values-text' });
  return uri;
}
