import configuration from "../../../config/public.json" with { type: "json" };

export const publicConfig = configuration;
export function mathExternalUrl(filename) {
  return new URL(filename, publicConfig.math.externalBaseUrl.replace(/\/?$/, "/"));
}
