import configuration from "../../../config/system.json";
import type { AppearanceConfig } from "../../../shared/appearance.mjs";
export interface BrowserConfig {
  appearance?: AppearanceConfig;
  math: { externalUrl: string; printStationId: number };
}
export const publicConfig: typeof configuration.public & BrowserConfig;
export function configureBrowserConfig(configuration?: BrowserConfig): void;
export function mathExternalUrl(filename: string): URL | null;
