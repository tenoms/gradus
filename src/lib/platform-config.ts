export type IntegrationTarget = "yyb" | "math" | "computer";
export type SecretPath =
  | "yyb.apiKey"
  | "math.ocrUsername"
  | "math.ocrPassword"
  | "computer.oauthClientSecret"
  | "computer.videoKey"
  | "computer.videoIv";

export interface IntegrationConfig {
  yyb: { baseUrl: string };
  math: {
    enabled: boolean;
    baseUrl: string;
    appId: string;
    stationId: number;
    loginId: number;
    ocrUrl: string;
  };
  computer: {
    enabled: boolean;
    baseUrl: string;
    appId: string;
    tenantCode: string;
    oauthClientId: string;
  };
}

export interface IntegrationConfiguration {
  revision: number;
  config: IntegrationConfig;
  secretStatus: Record<SecretPath, boolean>;
  affectedPlatforms?: ("math" | "computer")[];
}

export interface IntegrationProbe {
  target: IntegrationTarget | "all";
  ok: boolean;
  checkedAt: string;
  checks: { name: string; ok: boolean; message: string; durationMs?: number }[];
}

export interface IntegrationAccount {
  ref: string;
  nickname?: string;
  status?: string;
  serviceName?: string;
  routes?: { serviceId: string; serviceName: string; rawRef: string; status: string }[];
}
