export interface ComputerWorkflowLaunch { examType?: number; readOnly?: boolean; random?: boolean; redo?: unknown; voice?: boolean }
export function computerDraftScope(session: import("../../lib/api").Session): string;
export function computerAnswerMode(launch?: ComputerWorkflowLaunch): "readonly" | "practice" | "paper";
export function computerImmediateChoice(launch: ComputerWorkflowLaunch, exerciseType: unknown): boolean;
export function computerAnalysisVisible(launch: ComputerWorkflowLaunch, submitted?: boolean, finished?: boolean, skipped?: boolean): boolean;
export function computerOptionFeedback(option: unknown, expected: unknown, selected: boolean, revealed: boolean): "correct" | "incorrect" | "";
export function computerQuestionProgress(launch: ComputerWorkflowLaunch, record?: Record<string, unknown>, draft?: boolean, finished?: boolean, skipped?: boolean): import("../learning/answer-progress.mjs").AnswerProgress;
export function computerChoiceAnswer(exerciseType: unknown, current: string, option: unknown): string;
export function computerQuestionVideoSource(question?: Record<string, unknown>): { url: string; kind: "media" | "page" } | null;
