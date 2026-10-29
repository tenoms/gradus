export function hasMathQuestionContent(value: unknown): boolean;
export function mathQuestionPrompt(question: Record<string, any>, stem?: Record<string, any>[]): { content: unknown[]; image: string };
export function mathQuestionChoice(options: Record<string, any>[], question?: Record<string, any>, context?: { readOnly?: boolean; lockAnalysis?: boolean }): { multiple: boolean; immediate: boolean };
export function mathQuestionMedia(row: Record<string, any>): { kind: "video" | "polyv" | "image" | "file" | "none"; url: string };
