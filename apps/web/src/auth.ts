const DEFAULT_SERVER_URL = "http://localhost:3000";

export interface AuthUser {
  readonly workosUserId: string;
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly displayName: string;
  readonly emailVerified: boolean | null;
  readonly profilePictureUrl: string | null;
}

export interface LocalIdentity {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly profileId: string | null;
  readonly membershipId: string | null;
  readonly role: string | null;
}

export interface AuthenticatedMe {
  readonly authenticated: true;
  readonly user: AuthUser;
  readonly workosOrganizationId: string | null;
  readonly localIdentity: LocalIdentity;
}

export interface UnauthenticatedMe {
  readonly authenticated: false;
  readonly reason: string;
}

export type AuthMe = AuthenticatedMe | UnauthenticatedMe;

export function getServerUrl(): string {
  return trimTrailingSlash(import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL);
}

export async function getAuthMe(serverUrl = getServerUrl()): Promise<AuthMe> {
  const response = await fetch(`${serverUrl}/auth/me`, {
    credentials: "include",
    headers: {
      accept: "application/json"
    }
  });

  const body = (await response.json()) as AuthMe;
  if (response.ok || body.authenticated === false) {
    return body;
  }

  throw new Error("Unable to load auth state.");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
