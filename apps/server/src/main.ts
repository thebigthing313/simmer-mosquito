import { serve } from "@hono/node-server";
import { createWorkOsAuth, WORKOS_SESSION_COOKIE_NAME } from "@simmer-mosquito/auth";
import {
  createDb,
  listOperatorOrganizations,
  type OrganizationSubscriptionStatus,
  resolveActiveLocalAuthIdentity,
  type SafeOrganization,
  upsertOperatorOrganization,
  upsertWorkOsIdentity
} from "@simmer-mosquito/db";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import {
  resolveAuthContext,
  toAuthFailureBody,
  toAuthMeBody,
  toPublicAuthContext
} from "./auth-context.js";
import {
  type AuthVariables,
  createAuthContextMiddleware
} from "./auth-middleware.js";
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

const app = new Hono<{ Variables: AuthVariables }>();
const localIdentityResolver = {
  resolveActiveLocalAuthIdentity: (input: {
    readonly workosUserId: string;
    readonly workosOrganizationId: string;
  }) => resolveActiveLocalAuthIdentity(db, input)
};
const authContextMiddleware = createAuthContextMiddleware({
  auth,
  localIdentityResolver,
  setAuthCookie
});

app.use(
  "/auth/*",
  cors({
    origin: env.appOrigin,
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"]
  })
);

app.use(
  "/admin/*",
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
  const result = await resolveAuthContext({
    sealedSession: getCookie(context, WORKOS_SESSION_COOKIE_NAME),
    auth,
    localIdentityResolver
  });

  if (result.sealedSession !== undefined) {
    setAuthCookie(context, result.sealedSession);
  }

  if (!result.ok) {
    return context.json(toAuthFailureBody(result), result.status);
  }

  return context.json(toAuthMeBody(result.context));
});

app.get("/admin/organizations", authContextMiddleware, async (context) => {
  const authContext = context.get("authContext");
  if (!isOperatorEmail(authContext.user.email)) {
    return context.json({ error: "operator_required" }, 403);
  }

  const organizations = await listOperatorOrganizations(db);

  return context.json({
    organizations: organizations.map(toAdminOrganizationResponse)
  });
});

app.post("/admin/organizations", authContextMiddleware, async (context) => {
  const authContext = context.get("authContext");
  if (!isOperatorEmail(authContext.user.email)) {
    return context.json({ error: "operator_required" }, 403);
  }

  const payloadResult = await readCreateOrganizationPayload(context.req);
  if (!payloadResult.ok) {
    return context.json(
      {
        error: "invalid_payload",
        reason: payloadResult.reason
      },
      400
    );
  }

  const workosOrganization = await auth.createOrganization({
    name: payloadResult.payload.name
  });

  const organization = await upsertOperatorOrganization(db, {
    workosOrganizationId: workosOrganization.workosOrganizationId,
    name: workosOrganization.name,
    slug: payloadResult.payload.slug,
    subscriptionStatus: payloadResult.payload.subscriptionStatus,
    billingMode: "manual_invoice",
    billingContactName: payloadResult.payload.billingContactName,
    billingContactEmail: payloadResult.payload.billingContactEmail,
    subscriptionNotes: payloadResult.payload.subscriptionNotes,
    ...(payloadResult.payload.linkRequesterAsOwner
      ? {
          ownerUserId: authContext.user.id,
          ownerDisplayName: authContext.user.displayName,
          ownerEmail: authContext.user.email
        }
      : {})
  });

  return context.json(toAdminOrganizationResponse(organization), 201);
});

if (env.nodeEnv !== "production") {
  app.use(
    "/debug/*",
    cors({
      origin: env.appOrigin,
      credentials: true,
      allowMethods: ["GET", "OPTIONS"]
    })
  );

  app.get("/debug/auth-context", authContextMiddleware, (context) =>
    context.json(toPublicAuthContext(context.get("authContext")))
  );
}

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

function isOperatorEmail(email: string): boolean {
  return env.simmerOperatorEmails.includes(email.trim().toLowerCase());
}

interface CreateOrganizationPayload {
  readonly name: string;
  readonly slug: string | null;
  readonly subscriptionStatus: OrganizationSubscriptionStatus;
  readonly billingContactName: string | null;
  readonly billingContactEmail: string | null;
  readonly subscriptionNotes: string | null;
  readonly linkRequesterAsOwner: boolean;
}

type PayloadResult =
  | {
      readonly ok: true;
      readonly payload: CreateOrganizationPayload;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

async function readCreateOrganizationPayload(
  request: { readonly json: () => Promise<unknown> }
): Promise<PayloadResult> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      reason: "Request body must be JSON."
    };
  }

  if (!isRecord(raw)) {
    return {
      ok: false,
      reason: "Request body must be an object."
    };
  }

  const name = readRequiredText(raw.name);
  if (name === null) {
    return {
      ok: false,
      reason: "name is required."
    };
  }

  const subscriptionStatus = readSubscriptionStatus(raw.subscriptionStatus);
  if (subscriptionStatus === null) {
    return {
      ok: false,
      reason: "subscriptionStatus must be trial, active, suspended, or canceled."
    };
  }

  const billingMode = readOptionalText(raw.billingMode) ?? "manual_invoice";
  if (billingMode !== "manual_invoice") {
    return {
      ok: false,
      reason: "billingMode must be manual_invoice."
    };
  }

  return {
    ok: true,
    payload: {
      name,
      slug: readOptionalText(raw.slug),
      subscriptionStatus,
      billingContactName: readOptionalText(raw.billingContactName),
      billingContactEmail: readOptionalText(raw.billingContactEmail),
      subscriptionNotes: readOptionalText(raw.subscriptionNotes),
      linkRequesterAsOwner: raw.linkRequesterAsOwner === true
    }
  };
}

function readSubscriptionStatus(
  value: unknown
): OrganizationSubscriptionStatus | null {
  if (value === undefined || value === null || value === "") {
    return "trial";
  }

  if (
    value === "trial" ||
    value === "active" ||
    value === "suspended" ||
    value === "canceled"
  ) {
    return value;
  }

  return null;
}

function readRequiredText(value: unknown): string | null {
  const text = readOptionalText(value);
  return text === null ? null : text;
}

function readOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAdminOrganizationResponse(
  organization: SafeOrganization
) {
  return {
    id: organization.id,
    workosOrganizationId: organization.workosOrganizationId,
    name: organization.name,
    slug: organization.slug,
    subscription: organization.subscription,
    ownerLinked: organization.ownerLinked,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt
  };
}
