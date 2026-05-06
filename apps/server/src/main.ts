import { serve } from "@hono/node-server";
import { createWorkOsAuth, WORKOS_SESSION_COOKIE_NAME } from "@simmer-mosquito/auth";
import { createDb, upsertWorkOsIdentity } from "@simmer-mosquito/db";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { readServerEnv } from "./env.js";

const env = readServerEnv();
const auth = createWorkOsAuth({
  apiKey: env.workosApiKey,
  clientId: env.workosClientId,
  cookiePassword: env.workosCookiePassword,
  redirectUri: env.workosRedirectUri
});
const db = createDb({
  databaseUrl: env.databaseUrl
});

const app = new Hono();

app.use(
  "/auth/*",
  cors({
    origin: env.appOrigin,
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"]
  })
);

app.get("/health", (context) =>
  context.json({
    ok: true,
    service: "simmer-mosquito-server",
    environment: env.nodeEnv
  })
);

app.get("/auth/login", (context) => context.redirect(auth.getAuthorizationUrl()));

app.get("/auth/callback", async (context) => {
  const code = context.req.query("code");

  if (code === undefined || code.trim() === "") {
    return context.json({ error: "missing_code" }, 400);
  }

  const ipAddress = context.req.header("x-forwarded-for");
  const userAgent = context.req.header("user-agent");
  const session = await auth.authenticateCode({
    code,
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent })
  });

  const organization = await auth.getOrganization(session.workosOrganizationId);
  const localIdentity = await upsertWorkOsIdentity(db, {
    ...session.user,
    workosOrganizationId: session.workosOrganizationId,
    workosOrganizationName: organization?.name ?? null,
    workosRole: session.role
  });

  setAuthCookie(context, session.sealedSession);

  const redirectUrl = new URL("/", env.appOrigin);
  if (localIdentity.organizationId === null) {
    redirectUrl.searchParams.set("auth", "organization_required");
  }

  return context.redirect(redirectUrl.toString());
});

app.get("/auth/me", async (context) => {
  const session = await auth.authenticateSession(
    getCookie(context, WORKOS_SESSION_COOKIE_NAME)
  );

  if (!session.authenticated) {
    return context.json({ authenticated: false, reason: session.reason }, 401);
  }

  if (session.sealedSession !== undefined) {
    setAuthCookie(context, session.sealedSession);
  }

  const organization = await auth.getOrganization(session.workosOrganizationId);
  const localIdentity = await upsertWorkOsIdentity(db, {
    ...session.user,
    workosOrganizationId: session.workosOrganizationId,
    workosOrganizationName: organization?.name ?? null,
    workosRole: session.role
  });

  return context.json({
    authenticated: true,
    user: session.user,
    workosOrganizationId: session.workosOrganizationId,
    localIdentity
  });
});

app.post("/auth/logout", async (context) => {
  const logoutUrl = await auth.getLogoutUrl(
    getCookie(context, WORKOS_SESSION_COOKIE_NAME)
  );

  deleteCookie(context, WORKOS_SESSION_COOKIE_NAME, {
    path: "/"
  });

  return context.redirect(logoutUrl ?? env.appOrigin);
});

serve(
  {
    fetch: app.fetch,
    hostname: env.host,
    port: env.port
  },
  (info) => {
    console.log(`Server listening on http://${info.address}:${info.port}`);
  }
);

function setAuthCookie(
  context: Parameters<typeof setCookie>[0],
  sealedSession: string | undefined
): void {
  if (sealedSession === undefined) {
    return;
  }

  setCookie(context, WORKOS_SESSION_COOKIE_NAME, sealedSession, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "Lax",
    secure: env.nodeEnv === "production"
  });
}
