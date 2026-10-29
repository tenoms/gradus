export function durationSeconds(value: unknown): number;
export function calendarFinished(calendar: Record<string, any>): boolean;
export function taskType(task: Record<string, any>): string;
export function videoProgressRecord(
  context: Record<string, any>,
  task: Record<string, any>,
  seconds: number,
  duration: number,
  previous?: Record<string, any>,
): Record<string, any>;

export function leakPaperState(
  task: Record<string, any>,
  outstanding?: number,
): number;
export function courseMinutes(seconds: any): number;
export function packetTreeRows(rows: Record<string, any>[]): Record<string, any>[];
export function completedCourseAssignments(tasks: Record<string, any>[]): {
  rows: Record<string, any>[];
  total: number;
};
export function courseResumeTarget(input: any): Record<string, any> | undefined;
export function packetResumeEntry(
  sections: Record<string, any>[],
  record: Record<string, any>,
): { entry: Record<string, any>; section: Record<string, any> } | undefined;
export function courseTasksFinished(tasks: Record<string, any>[]): boolean;
export function packetVisitRecord(
  stuid: string,
  productID: any,
  packetID: any,
  entry: Record<string, any>,
  now?: number,
): Record<string, any>;
export function courseQuestionRecord(
  context: Record<string, any>,
  task: Record<string, any>,
  answer: string | number,
  previous?: Record<string, any>,
): Record<string, any>;
