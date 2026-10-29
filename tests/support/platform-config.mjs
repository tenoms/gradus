import { initialPlatformConfig } from "../../server/integrations/platform-config.mjs";

/** Explicit upstream fixtures keep tests independent of deployment configuration. */
export function platformConfigFixture(patch = {}) {
  const config = initialPlatformConfig();
  Object.assign(config.math, { enabled: true, baseUrl: "https://math.example.test", appId: "wx1111111111111111" });
  Object.assign(config.computer, { enabled: true, baseUrl: "https://computer.example.test", appId: "wx2222222222222222", oauthClientId: "web_app", oauthClientSecret: "fixture-oauth-secret" });
  for (const [section, values] of Object.entries(patch)) Object.assign(config[section], values);
  return config;
}
