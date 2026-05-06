import { WorkOS } from "@workos-inc/node";

export const WORKOS_SESSION_COOKIE_NAME = "wos-session";

export interface WorkOsAuthConfig {
  readonly apiKey: string;
  readonly clientId: string;
  readonly cookiePassword: string;
  readonly redirectUri: string;
}

export interface AuthUser {
  readonly workosUserId: string;
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly displayName: string;
  readonly emailVerified: boolean | null;
  readonly profilePictureUrl: string | null;
}

export interface AuthOrganization {
  readonly workosOrganizationId: string;
  readonly name: string;
}

export interface AuthenticatedSession {
  readonly authenticated: true;
  readonly user: AuthUser;
  readonly workosOrganizationId: string | null;
  readonly sessionId: string | null;
  readonly role: string | null;
  readonly sealedSession?: string;
}

export interface UnauthenticatedSession {
  readonly authenticated: false;
  readonly reason: string;
}

export type SessionAuthenticationResult =
  | AuthenticatedSession
  | UnauthenticatedSession;

interface WorkOsUserLike {
  readonly id: string;
  readonly email: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly emailVerified?: boolean | null;
  readonly profilePictureUrl?: string | null;
}

export function createWorkOsAuth(config: WorkOsAuthConfig) {
  const workos = new WorkOS(config.apiKey, {
    clientId: config.clientId
  });

  return {
    getAuthorizationUrl(): string {
      return workos.userManagement.getAuthorizationUrl({
        provider: "authkit",
        redirectUri: config.redirectUri,
        clientId: config.clientId
      });
    },

    async authenticateCode(options: {
      readonly code: string;
      readonly ipAddress?: string;
      readonly userAgent?: string;
    }): Promise<AuthenticatedSession> {
      const request = {
        clientId: config.clientId,
        code: options.code,
        ...(options.ipAddress === undefined
          ? {}
          : { ipAddress: options.ipAddress }),
        ...(options.userAgent === undefined
          ? {}
          : { userAgent: options.userAgent }),
        session: {
          sealSession: true,
          cookiePassword: config.cookiePassword
        }
      };

      const response = await workos.userManagement.authenticateWithCode({
        ...request
      });

      if (response.sealedSession === undefined) {
        throw new Error("WorkOS did not return a sealed session.");
      }

      return {
        authenticated: true,
        user: toAuthUser(response.user),
        workosOrganizationId: response.organizationId ?? null,
        sessionId: null,
        role: null,
        sealedSession: response.sealedSession
      };
    },

    async authenticateSession(
      sealedSession: string | undefined
    ): Promise<SessionAuthenticationResult> {
      if (sealedSession === undefined || sealedSession.trim() === "") {
        return {
          authenticated: false,
          reason: "no_session_cookie_provided"
        };
      }

      const session = workos.userManagement.loadSealedSession({
        sessionData: sealedSession,
        cookiePassword: config.cookiePassword
      });

      const authResult = await session.authenticate();
      if (authResult.authenticated) {
        return {
          authenticated: true,
          user: toAuthUser(authResult.user),
          workosOrganizationId: authResult.organizationId ?? null,
          sessionId: authResult.sessionId,
          role: authResult.role ?? null
        };
      }

      const refreshResult = await session.refresh();
      if (refreshResult.authenticated) {
        const refreshedSession: AuthenticatedSession = {
          authenticated: true,
          user: toAuthUser(refreshResult.user),
          workosOrganizationId: refreshResult.organizationId ?? null,
          sessionId: refreshResult.sessionId,
          role: refreshResult.role ?? null
        };

        if (refreshResult.sealedSession !== undefined) {
          return {
            ...refreshedSession,
            sealedSession: refreshResult.sealedSession
          };
        }

        return refreshedSession;
      }

      return {
        authenticated: false,
        reason: refreshResult.reason ?? authResult.reason ?? "unauthenticated"
      };
    },

    async getLogoutUrl(sealedSession: string | undefined): Promise<string | null> {
      if (sealedSession === undefined || sealedSession.trim() === "") {
        return null;
      }

      const session = workos.userManagement.loadSealedSession({
        sessionData: sealedSession,
        cookiePassword: config.cookiePassword
      });

      return session.getLogoutUrl();
    },

    async getOrganization(
      workosOrganizationId: string | null
    ): Promise<AuthOrganization | null> {
      if (workosOrganizationId === null) {
        return null;
      }

      const organization =
        await workos.organizations.getOrganization(workosOrganizationId);

      return {
        workosOrganizationId: organization.id,
        name: organization.name
      };
    }
  };
}

function toAuthUser(user: WorkOsUserLike): AuthUser {
  const firstName = user.firstName ?? null;
  const lastName = user.lastName ?? null;
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    workosUserId: user.id,
    email: user.email,
    firstName,
    lastName,
    displayName: displayName === "" ? user.email : displayName,
    emailVerified: user.emailVerified ?? null,
    profilePictureUrl: user.profilePictureUrl ?? null
  };
}
