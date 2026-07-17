import { describe, expect, it } from 'vitest';
import { SerializedStateStore } from '../src/services/serializedStateStore';

describe('SerializedStateStore', () => {
  it('preserves both updates when asynchronous callers start from the same render', async () => {
    const writes: Array<{ entries: string[]; attachments: string[] }> = [];
    const store = new SerializedStateStore(
      { entries: [] as string[], attachments: [] as string[] },
      async value => {
        await new Promise(resolve => setTimeout(resolve, 2));
        writes.push({ entries: [...value.entries], attachments: [...value.attachments] });
      },
    );

    const addEntry = store.update(current => ({ ...current, entries: ['entry-1', ...current.entries] }));
    const addAttachment = store.update(current => ({ ...current, attachments: ['photo-1', ...current.attachments] }));

    await Promise.all([addEntry, addAttachment]);

    expect(store.snapshot).toEqual({ entries: ['entry-1'], attachments: ['photo-1'] });
    expect(writes).toEqual([
      { entries: ['entry-1'], attachments: [] },
      { entries: ['entry-1'], attachments: ['photo-1'] },
    ]);
  });

  it('continues processing updates after a failed write', async () => {
    let attempts = 0;
    const store = new SerializedStateStore({ count: 0 }, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('disk full');
    });

    await expect(store.update(current => ({ count: current.count + 1 }))).rejects.toThrow('disk full');
    await expect(store.update(current => ({ count: current.count + 1 }))).resolves.toEqual({ count: 1 });
  });
});
