import { describe, expect, it } from 'vitest';
import { flattenTranslationKeys, t, translationKeys } from '../src/i18n';
import { sk } from '../src/i18n/translations';
import { formatDate, formatNumber } from '../src/i18n/format';

describe('Slovak i18n', () => {
  it('has no missing leaf values and interpolates labels', () => { expect(translationKeys.length).toBeGreaterThan(80); expect(flattenTranslationKeys(sk).every(key => translationKeys.includes(key))).toBe(true); expect(t('dashboard.pendingCount', { count: 3 })).toContain('3'); });
  it('formats dates and numbers with sk-SK rules', () => { expect(formatDate('2024-05-20T09:42:00Z')).toMatch(/2024/); expect(formatNumber(1234.5)).toMatch(/1.?234,5/); });
});
