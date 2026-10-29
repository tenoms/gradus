import configuration from "../../../config/system.json" with { type: "json" };

export const publicConfig = configuration.public;
export function mathExternalUrl(filename) {
  return new URL(filename, publicConfig.math.externalBaseUrl.replace(/\/?$/, "/"));
}
