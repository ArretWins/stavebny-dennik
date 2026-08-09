import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('tool inventory report type migration', () => {
  it('adds the private report type on PostgreSQL', async () => {
    const db = new PGlite();
    try {
      await db.exec(`create type public.report_type as enum (
        'diary','delay','evidence_pack','weekly'
      )`);
      await db.exec(
        readFileSync(
          'supabase/migrations/202608010004_tool_inventory_reports.sql',
          'utf8',
        ),
      );
      const values = await db.query<{ value: string }>(`
        select unnest(enum_range(null::public.report_type))::text value
      `);
      expect(values.rows.map(row => row.value)).toContain('tool_inventory');
    } finally {
      await db.close();
    }
  });
});
