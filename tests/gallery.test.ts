import { describe, expect, it } from 'vitest';
import { filterGalleryAttachments, galleryCategory, groupGalleryByDay } from '../src/domain/gallery';
import type { Attachment } from '../src/domain/types';

function photo(id: string, type: Attachment['relatedEntityType'], createdAt: string): Attachment {
  return {
    id,
    ownerId: 'owner-1',
    projectId: 'project-1',
    relatedEntityType: type,
    localUri: `file:///${id}.jpg`,
    fileSize: 100,
    mimeType: 'image/jpeg',
    createdAt,
    uploadStatus: 'synced',
  };
}

describe('project gallery', () => {
  const photos = [
    photo('general', 'attachment', '2026-07-15T08:00:00.000Z'),
    photo('delay', 'delay_event', '2026-07-16T09:00:00.000Z'),
    photo('work', 'diary_entry', '2026-07-16T10:00:00.000Z'),
  ];

  it('maps evidence types to construction-friendly categories', () => {
    expect(photos.map(galleryCategory)).toEqual(['other', 'delay', 'work']);
  });

  it('filters and orders the newest photos first', () => {
    expect(filterGalleryAttachments(photos, 'all').map(item => item.id)).toEqual(['work', 'delay', 'general']);
    expect(filterGalleryAttachments(photos, 'delay').map(item => item.id)).toEqual(['delay']);
  });

  it('groups a filtered timeline by calendar day', () => {
    const groups = groupGalleryByDay(filterGalleryAttachments(photos, 'all'));
    expect(groups.map(group => [group.date, group.items.map(item => item.id)])).toEqual([
      ['2026-07-16', ['work', 'delay']],
      ['2026-07-15', ['general']],
    ]);
  });
});
