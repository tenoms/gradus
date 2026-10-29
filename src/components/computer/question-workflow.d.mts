export interface ComputerWorkflowLaunch { examType?: number; readOnly?: boolean; random?: boolean; redo?: unknown; voice?: boolean }
export function computerAnswerMode(launch?: ComputerWorkflowLaunch): "readonly" | "practice" | "paper";
export function computerImmediateChoice(launch: ComputerWorkflowLaunch, exerciseType: unknown): boolean;
export function computerChoiceAnswer(exerciseType: unknown, current: string, option: unknown): string;
export function computerQuestionVideoSource(question?: Record<string, unknown>): { url: string; kind: "media" | "page" } | null;
