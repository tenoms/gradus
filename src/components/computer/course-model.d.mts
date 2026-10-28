export function orderedSubcourses(
  course: Record<string, any>,
): Record<string, any>[];
export function studyCourseId(
  course: Record<string, any> | null,
  selected?: string,
): string;
export function isCourseOwned(
  course: Record<string, any> | null,
  permission: unknown,
  joined?: boolean,
): boolean;
export function lessonCanPlay(
  lesson: Record<string, any>,
  owned: boolean,
): boolean;
export function courseAttachments(
  lesson: Record<string, any> | null,
  detail: Record<string, any> | null,
): { name: string; url: string; [key: string]: any }[];
export function lessonProgress(input: {
  lesson: Record<string, any>;
  courseId: string;
  position: number;
  duration: number;
  elapsed: number;
  at?: number;
}): Record<string, any>;
export function maskCourseReviewer(value: unknown): string;
