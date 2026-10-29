import configuration from "../../../config/system.json";
export interface BrowserConfig {
  math: { externalUrl: string; printStationId: number };
  media: { polyvSdkUrl: string };
}
export const publicConfig: typeof configuration.public & BrowserConfig;
export function configureBrowserConfig(configuration?: BrowserConfig): void;
export function mathExternalUrl(filename: string): URL | null;
