import type { ProjectWorker, WorkShift } from './types';

export type ShiftAttention = 'none' | 'active_long' | 'long_shift' | 'invalid';

export function workShiftMinutes(shift: Pick<WorkShift, 'startedAt' | 'endedAt' | 'breakMinutes'>): number {
  if (!shift.endedAt) return 0;
  const elapsed = Math.floor((Date.parse(shift.endedAt) - Date.parse(shift.startedAt)) / 60_000);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.max(0, elapsed - Math.max(0, shift.breakMinutes));
}

export function workShiftOvertimeMinutes(shift: Pick<WorkShift, 'startedAt' | 'endedAt' | 'breakMinutes'>, regularMinutes = 8 * 60): number {
  return Math.max(0, workShiftMinutes(shift) - regularMinutes);
}

export function workShiftAttention(shift: WorkShift, now = Date.now()): ShiftAttention {
  const started = Date.parse(shift.startedAt);
  const ended = shift.endedAt ? Date.parse(shift.endedAt) : undefined;
  if (!Number.isFinite(started) || started > now + 5 * 60_000 || (ended !== undefined && (!Number.isFinite(ended) || ended <= started))) return 'invalid';
  if (!shift.endedAt && now - started > 12 * 60 * 60 * 1000) return 'active_long';
  if (workShiftMinutes(shift) > 12 * 60) return 'long_shift';
  return 'none';
}

export function validateWorkShift(input: { startedAt: string; endedAt: string; breakMinutes: number; note?: string }): 'ok' | 'time' | 'break' | 'note' {
  const start = Date.parse(input.startedAt), end = Date.parse(input.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 60 * 60 * 1000 || start > Date.now() + 5 * 60_000 || end > Date.now() + 5 * 60_000) return 'time';
  if (!Number.isInteger(input.breakMinutes) || input.breakMinutes < 0 || input.breakMinutes > 240 || input.breakMinutes * 60_000 >= end - start) return 'break';
  if (input.note && input.note.trim().length > 500) return 'note';
  return 'ok';
}

export function hasWorkShiftOverlap(shifts: WorkShift[], candidate: { id?: string; projectId: string; workerId: string; startedAt: string; endedAt: string }): boolean {
  const start = Date.parse(candidate.startedAt), end = Date.parse(candidate.endedAt);
  return shifts.some(shift => shift.id !== candidate.id && shift.projectId === candidate.projectId && shift.workerId === candidate.workerId && Date.parse(shift.startedAt) < end && Date.parse(shift.endedAt ?? '9999-12-31T23:59:59.999Z') > start);
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function workShiftCsv(input: { projectName: string; shifts: WorkShift[]; workers: ProjectWorker[]; dateFrom: string; dateTo: string }): string {
  const workerById = new Map(input.workers.map(worker => [worker.id, worker]));
  const rows: Array<Array<string | number>> = [
    ['Objekt', input.projectName],
    ['Obdobie', `${input.dateFrom} – ${input.dateTo}`],
    [],
    ['Dátum', 'Pracovník', 'Pozícia', 'Príchod', 'Odchod', 'Prestávka (min)', 'Odpracované (h)', 'Nadčas (h)', 'Stav', 'Poznámka'],
  ];
  for (const shift of [...input.shifts].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const worker = workerById.get(shift.workerId);
    const minutes = workShiftMinutes(shift);
    rows.push([
      shift.shiftDate,
      worker ? `${worker.firstName} ${worker.lastName}` : shift.workerId,
      worker?.position ?? '',
      new Date(shift.startedAt).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }),
      shift.endedAt ? new Date(shift.endedAt).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) : '',
      shift.breakMinutes,
      (minutes / 60).toFixed(2).replace('.', ','),
      (workShiftOvertimeMinutes(shift) / 60).toFixed(2).replace('.', ','),
      shift.status === 'approved' ? 'Potvrdená' : shift.status === 'completed' ? 'Na kontrolu' : 'Prebieha',
      shift.note ?? '',
    ]);
  }
  return `\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}
