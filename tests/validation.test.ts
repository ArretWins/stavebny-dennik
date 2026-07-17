import { describe, expect, it } from 'vitest';
import { MAX_FILE_SIZE, MAX_NOTE, MAX_WORK_DESCRIPTION, validateAttachment, validateDiaryInput, validateDelayInput } from '../src/domain/validation';

describe('capture validation', () => {
  it('enforces diary fields and character limits', () => {
    expect(validateDiaryInput({ workDescription: '', workerCount: 0, note: '' })).toContain('workRequired');
    expect(validateDiaryInput({ workDescription: 'x'.repeat(MAX_WORK_DESCRIPTION + 1), workerCount: 0, note: '' })).toContain('workTooLong');
    expect(validateDiaryInput({ workDescription: 'Murárske práce', workerCount: 0, note: 'x'.repeat(MAX_NOTE + 1) })).toContain('noteTooLong');
  });
  it('requires a delay reason', () => { expect(validateDelayInput({ note: '' })).toContain('reasonRequired'); });
  it('validates image type and ten megabyte size', () => {
    expect(validateAttachment({ size: MAX_FILE_SIZE + 1, mimeType: 'image/jpeg' })).toBe('too_large');
    expect(validateAttachment({ size: 10, mimeType: 'application/pdf' })).toBe('unsupported');
    expect(validateAttachment({ size: 10, mimeType: 'image/jpeg' })).toBe('ok');
  });
});
