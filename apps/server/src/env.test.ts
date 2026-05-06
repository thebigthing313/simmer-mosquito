import { describe, expect, it } from "vitest";
import { readServerEnv } from "./env.js";

const baseEnv = {
  APP_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/simmer_mosquito",
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "replace-with-at-least-32-characters",
  WORKOS_REDIRECT_URI: "http://localhost:3000/auth/callback"
};

describe("readServerEnv", () => {
  it("normalizes APP_ORIGIN to an origin for CORS matching", () => {
    expect(
      readServerEnv({
        ...baseEnv,
        APP_ORIGIN: "http://localhost:5173/"
      }).appOrigin
    ).toBe("http://localhost:5173");
  });
});
