import type { Attachment } from './types';

export type GalleryCategory = 'work' | 'delay' | 'other';
export type GalleryFilter = 'all' | GalleryCategory;

export function galleryCategory(attachment: Attachment): GalleryCategory {
  if (attachment.relatedEntityType === 'diary_entry') return 'work';
  if (attachment.relatedEntityType === 'delay_event') return 'delay';
  return 'other';
}

export function filterGalleryAttachments(
  attachments: Attachment[],
  filter: GalleryFilter,
): Attachment[] {
  return [...attachments]
    .filter(item => filter === 'all' || galleryCategory(item) === filter)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function groupGalleryByDay(attachments: Attachment[]): Array<{ date: string; items: Attachment[] }> {
  const groups = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    const date = attachment.createdAt.slice(0, 10);
    groups.set(date, [...(groups.get(date) ?? []), attachment]);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}
