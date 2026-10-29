import { initialPlatformConfig } from "../../server/integrations/platform-config.mjs";

/** Explicit upstream fixtures keep tests independent of deployment configuration. */
export function platformConfigFixture(patch = {}) {
  const config = initialPlatformConfig();
  for (const [section, values] of Object.entries(patch)) Object.assign(config[section], values);
  return config;
}
