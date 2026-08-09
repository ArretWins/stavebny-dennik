import type {
  Attachment,
  Project,
  ProjectChecklist,
  SiteTask,
  SiteTaskEvent,
} from "./types";

export interface TaskEvidenceManifestInput {
  project: Project;
  task: SiteTask;
  events: SiteTaskEvent[];
  checklist?: ProjectChecklist;
  attachments: Array<
    Pick<
      Attachment,
      | "id"
      | "evidenceRole"
      | "createdAt"
      | "fileSize"
      | "mimeType"
      | "captureSource"
      | "capturedAt"
      | "latitude"
      | "longitude"
      | "contentSha256"
      | "integrityVersion"
      | "sourceFileName"
    > & {
      contentDigest?: string;
      integrityStatus?: "verified" | "mismatch" | "unrecorded" | "unavailable";
    }
  >;
  generatedAt: string;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  return value;
}

export function taskEvidenceManifest(
  input: TaskEvidenceManifestInput,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    project: canonicalValue({
      id: input.project.id,
      name: input.project.name,
      location: input.project.location,
      address: input.project.address,
    }),
    task: canonicalValue(input.task),
    checklist: input.checklist ? canonicalValue(input.checklist) : null,
    events: [...input.events]
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .map(canonicalValue),
    attachments: [...input.attachments]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(canonicalValue),
  };
}

export function canonicalManifestJson(
  manifest: Record<string, unknown>,
): string {
  return JSON.stringify(canonicalValue(manifest));
}
