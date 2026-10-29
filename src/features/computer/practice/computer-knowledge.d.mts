export interface KnowledgeReference { id: string; name: string }
export function computerKnowledgeReferences(question?: Record<string, any>): KnowledgeReference[];
export function computerKnowledgeMajorId(question?: Record<string, any>, fallback?: string): string;
export function computerKnowledgeIndex(rows?: any, initial?: Record<string, string>): Record<string, string>;
export function resolveComputerKnowledgeTags(question: Record<string, any>, index?: Record<string, string>): { tags: KnowledgeReference[]; missing: number };
export function createComputerKnowledgeLoader(request: (path: string, query: Record<string, any>) => Promise<any>): (scope: string, majorId: string, retry?: boolean) => Promise<Record<string, string>>;
