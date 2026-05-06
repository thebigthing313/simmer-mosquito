import {
  readEnv,
  readRequiredString,
  readRequiredUrl
} from "@simmer-mosquito/config";

export interface ServerEnv {
  readonly appOrigin: string;
  readonly databaseUrl: string;
  readonly host: string;
  readonly nodeEnv: "development" | "production" | "test";
  readonly port: number;
  readonly workosApiKey: string;
  readonly workosClientId: string;
  readonly workosCookiePassword: string;
  readonly workosRedirectUri: string;
}

export function readServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const base = readEnv(source);

  return {
    appOrigin: readRequiredOrigin(source, "APP_ORIGIN"),
    databaseUrl: readRequiredString(source, "DATABASE_URL"),
    host: base.host,
    nodeEnv: base.nodeEnv,
    port: base.port,
    workosApiKey: readRequiredString(source, "WORKOS_API_KEY"),
    workosClientId: readRequiredString(source, "WORKOS_CLIENT_ID"),
    workosCookiePassword: readRequiredString(source, "WORKOS_COOKIE_PASSWORD"),
    workosRedirectUri: readRequiredUrl(source, "WORKOS_REDIRECT_URI")
  };
}

function readRequiredOrigin(source: NodeJS.ProcessEnv, key: string): string {
  const value = readRequiredString(source, key);

  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${key} must be a valid URL. Received: ${value}`);
  }
}
