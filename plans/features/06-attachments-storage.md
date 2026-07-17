# Feature 06: Attachments And Storage

## Clear Sequence
1. Implement photo capture/upload entry points in diary and delay flows.
2. Store local attachment metadata for offline capture.
3. Upload attachments to Supabase private storage during sync.
4. Link attachments to diary records, delay events, and report exports.
5. Render attachment thumbnails and evidence count badges.

## Implementation Instructions
- MVP supports photo attachments only. Do not implement OCR receipt parsing or expense accounting.
- Each attachment stores owner, project, related entity type/id, local URI, storage path, file size, mime type, created timestamp, upload status, and optional thumbnail path.
- Use `DashedUploadBox` for capture/upload entry.
- Default max file size shown in UI: `Max. 10 MB / foto`.
- Private bucket access only; use signed URLs for viewing.
- Failed upload remains in pending sync state and can retry.

## Acceptance Criteria
- User can attach at least one photo to a diary record and a delay event.
- Attachment can be captured offline and uploaded later.
- Thumbnail/evidence count appears in the relevant record UI.
- Private storage object is not publicly accessible without an authorized signed URL.
- Oversized or unsupported files produce Slovak validation messages.
