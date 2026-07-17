import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SQLite persistence statements', () => {
  it('keeps the project worker columns and placeholders aligned', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/sqliteStore.ts'), 'utf8');
    const statement = source.match(
      /INSERT INTO project_workers \(([^)]+)\) VALUES \(([^)]+)\)/,
    );

    expect(statement).not.toBeNull();
    const columns = statement![1].split(',').map(value => value.trim());
    const placeholders = statement![2].split(',').map(value => value.trim());

    expect(columns).toHaveLength(12);
    expect(placeholders).toHaveLength(columns.length);
    expect(placeholders.every(value => value === '?')).toBe(true);
  });
});
