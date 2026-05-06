import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useSearch
} from "@tanstack/react-router";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getAuthMe, getServerUrl, type AuthMe, type AuthenticatedMe } from "./auth";
import "./styles.css";

interface RootSearch {
  readonly auth?: "organization_required";
}

const serverUrl = getServerUrl();

const rootRoute = createRootRoute({
  validateSearch: (search): RootSearch =>
    search.auth === "organization_required" ? { auth: "organization_required" } : {},
  component: RootLayout
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AppShell
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginRoute
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, loginRoute])
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RootLayout() {
  return (
    <div className="page">
      <header className="topbar">
        <Link className="brand" to="/">
          SIMMER
        </Link>
        <nav>
          <Link to="/login">Login</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function AppShell() {
  const search = useSearch({ from: rootRoute.id });
  const [authState, setAuthState] = useState<AuthMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAuthMe(serverUrl)
      .then((result) => {
        if (!cancelled) {
          setAuthState(result);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load auth state.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="shell">
      {search.auth === "organization_required" ? (
        <Notice
          tone="warning"
          title="Organization required"
          body="WorkOS returned no organization context. Pick or join an organization, then sign in again."
        />
      ) : null}

      {error === null ? null : <Notice tone="danger" title="Auth unavailable" body={error} />}

      {authState === null && error === null ? (
        <Panel title="Checking session">
          <p>Loading auth state...</p>
        </Panel>
      ) : null}

      {authState?.authenticated === false ? <UnauthenticatedPanel reason={authState.reason} /> : null}

      {authState?.authenticated === true ? <AuthenticatedPanel auth={authState} /> : null}
    </section>
  );
}

function LoginRoute() {
  return (
    <section className="shell">
      <Panel title="Sign in">
        <p>Use WorkOS AuthKit to enter SIMMER.</p>
        <a className="button" href={`${serverUrl}/auth/login`}>
          Continue with WorkOS
        </a>
      </Panel>
    </section>
  );
}

function AuthenticatedPanel({ auth }: { readonly auth: AuthenticatedMe }) {
  const membershipStatus = auth.localIdentity.membershipId === null ? "missing" : "active";
  const organization = auth.localIdentity.organizationId ?? auth.workosOrganizationId ?? "none";
  const profile = auth.localIdentity.profileId ?? "none";
  const role = auth.localIdentity.role ?? "none";

  return (
    <Panel title="Signed in">
      <div className="identity">
        {auth.user.profilePictureUrl === null ? (
          <div className="avatar" aria-hidden="true">
            {auth.user.displayName.slice(0, 1).toUpperCase()}
          </div>
        ) : (
          <img className="avatar" src={auth.user.profilePictureUrl} alt="" />
        )}
        <div>
          <h1>{auth.user.displayName}</h1>
          <p>{auth.user.email}</p>
        </div>
      </div>

      <dl className="facts">
        <Fact label="User" value={auth.localIdentity.userId} />
        <Fact label="Organization" value={organization} />
        <Fact label="Profile" value={profile} />
        <Fact label="Role" value={role} />
        <Fact label="Membership" value={membershipStatus} />
      </dl>

      <form action={`${serverUrl}/auth/logout`} method="post">
        <button className="button secondary" type="submit">
          Log out
        </button>
      </form>
    </Panel>
  );
}

function UnauthenticatedPanel({ reason }: { readonly reason: string }) {
  return (
    <Panel title="Signed out">
      <p>Session unavailable: {reason}</p>
      <a className="button" href={`${serverUrl}/auth/login`}>
        Sign in
      </a>
    </Panel>
  );
}

function Notice({
  tone,
  title,
  body
}: {
  readonly tone: "danger" | "warning";
  readonly title: string;
  readonly body: string;
}) {
  return (
    <div className={`notice ${tone}`}>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function Panel({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      {children}
    </article>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
