import configuration from "../../../config/system.json" with { type: "json" };

export const publicConfig = {
  ...configuration.public,
  math: { externalUrl: "", printStationId: 1 },
};

export function configureBrowserConfig(configuration) {
  if (!configuration) return;
  publicConfig.math.externalUrl = configuration.math.externalUrl;
  publicConfig.math.printStationId = configuration.math.printStationId;
}

export function mathExternalUrl(filename) {
  if (!publicConfig.math.externalUrl) return null;
  return new URL(filename, publicConfig.math.externalUrl.replace(/\/?$/, "/"));
}
