import system from '../../config/system.json';
export type RuntimeConfig = Omit<typeof system.runtime, 'database'> & {
  database: typeof system.runtime.database & { url: string };
};
export function readRuntimeConfig(options?: { env?: Record<string, string | undefined> }): RuntimeConfig;
export function validateRuntimeConfig(runtime: RuntimeConfig): RuntimeConfig;
