import defaults from '../../config/defaults.json';
export interface ConfigurationOptions {
  env?: Record<string, string | undefined>;
  configFile?: string | false;
}
export function deploymentConfigPath(options?: ConfigurationOptions): string | null;
export function readFileConfiguration(options?: ConfigurationOptions): typeof defaults;
