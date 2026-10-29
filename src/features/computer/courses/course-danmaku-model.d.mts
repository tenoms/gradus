export interface CourseDanmaku {
  key: string;
  text: string;
  time: number;
  index: number;
}
export function lessonDanmaku(lesson: Record<string, any>): CourseDanmaku[];
export function activeDanmaku(
  rows: CourseDanmaku[],
  current: number,
  windowSeconds?: number,
): CourseDanmaku[];
export function danmakuTime(value: number): string;
export function courseDanmakuPayload(
  lesson: Record<string, any>,
  message: string,
  position: number,
  hasPlayed: boolean,
): { lessonId: any; bulletComments: string; releaseTime: number };
export function sendCourseDanmaku(
  request: (platform: "computer", input: any) => Promise<any>,
  payload: Record<string, any>,
): Promise<any>;
