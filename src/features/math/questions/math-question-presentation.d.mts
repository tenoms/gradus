export function hasMathQuestionContent(value: unknown): boolean;
export function mathQuestionPrompt(question: Record<string, any>, stem?: Record<string, any>[]): { content: unknown[]; image: string };
export function mathQuestionChoice(options: Record<string, any>[], question?: Record<string, any>, context?: { readOnly?: boolean }): { multiple: boolean; immediate: boolean };
export function mathOptionFeedback(option: Record<string, any>, options: Record<string, any>[], selected: boolean, checked: boolean): "math-choice-correct" | "math-choice-incorrect" | "";
export function mathQuestionMedia(row: Record<string, any>): { kind: "video" | "polyv" | "image" | "file" | "none"; url: string };
