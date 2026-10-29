export function mathVideoSource(row: Record<string, any>): { url: string; vid: string };
export function mathVideoRequest(row: Record<string, any>): { vid: string; playsafe?: string; sign?: string; ts?: string | number; appId?: string };
export function mathVideoDescription(content: string): string;
