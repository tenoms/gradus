export function escapeReportText(value: unknown): string;
export function reportSnapshotFilename(title?: string, now?: Date): string;
export function safeReportSnapshotImage(
  value: unknown,
  baseUrl?: string,
): string;
export function reportSnapshotDocument(
  title: string | undefined,
  sanitizedBody: string,
  now?: Date,
): string;
