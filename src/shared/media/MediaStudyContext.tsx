import { createContext } from "react";

export type MediaStudy = { platform: "math" | "computer"; title: string; path: string; key?: string };
export type MediaStudyHandle = { setEnabled(value: boolean): void; stop(): void };
export const MediaStudyContext = createContext<((details: MediaStudy) => MediaStudyHandle | undefined) | null>(null);
