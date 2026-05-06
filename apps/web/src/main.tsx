import {
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	RouterProvider,
	useParams,
	useSearch,
} from '@tanstack/react-router';
import { type FormEvent, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
	type AdminMembership,
	type AdminOrganization,
	type AuthenticatedMe,
	type AuthMe,
	type CreateAdminOrganizationInput,
	createAdminOrganization,
	getAuthMe,
	getServerUrl,
	type InviteAdminUserInput,
	inviteAdminUser,
	listAdminOrganizations,
	listOrganizationMemberships,
	type SimmerRole,
} from './auth';
import './styles.css';

interface RootSearch {
	readonly auth?: 'organization_required';
}

const serverUrl = getServerUrl();

const rootRoute = createRootRoute({
	validateSearch: (search): RootSearch =>
		search.auth === 'organization_required' ? { auth: 'organization_required' } : {},
	component: RootLayout,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: AppShell,
});

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	component: LoginRoute,
});

const adminOrganizationsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/admin/organizations',
	component: AdminOrganizationsRoute,
});

const adminOrganizationDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/admin/organizations/$organizationId',
	component: AdminOrganizationDetailRoute,
});

const router = createRouter({
	routeTree: rootRoute.addChildren([
		indexRoute,
		loginRoute,
		adminOrganizationsRoute,
		adminOrganizationDetailRoute,
	]),
});

declare module '@tanstack/react-router' {
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
					<Link to="/admin/organizations">Admin</Link>
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
					setError(loadError instanceof Error ? loadError.message : 'Unable to load auth state.');
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<section className="shell">
			{search.auth === 'organization_required' ? (
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

			{authState?.authenticated === false ? (
				<UnauthenticatedPanel reason={authState.reason} />
			) : null}

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

function AdminOrganizationsRoute() {
	const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
	const [status, setStatus] = useState<string>('Loading organizations...');
	const [form, setForm] = useState<CreateAdminOrganizationInput>({
		name: '',
		subscriptionStatus: 'trial',
		billingContactName: '',
		billingContactEmail: '',
		subscriptionNotes: '',
		linkRequesterAsOwner: false,
	});

	useEffect(() => {
		let cancelled = false;

		listAdminOrganizations(serverUrl)
			.then((result) => {
				if (!cancelled) {
					setOrganizations(result);
					setStatus('');
				}
			})
			.catch((loadError: unknown) => {
				if (!cancelled) {
					setStatus(
						loadError instanceof Error ? loadError.message : 'Unable to load organizations.',
					);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus('Creating organization...');

		try {
			const organization = await createAdminOrganization(form, serverUrl);
			setOrganizations((current) => [organization, ...current]);
			setForm({
				name: '',
				subscriptionStatus: 'trial',
				billingContactName: '',
				billingContactEmail: '',
				subscriptionNotes: '',
				linkRequesterAsOwner: false,
			});
			setStatus('Organization created.');
		} catch (createError) {
			setStatus(
				createError instanceof Error ? createError.message : 'Unable to create organization.',
			);
		}
	}

	return (
		<section className="shell wide">
			<Panel title="Admin organizations">
				<form className="admin-form" onSubmit={submit}>
					<label>
						Agency name
						<input
							required
							value={form.name}
							onChange={(event) => setForm({ ...form, name: event.target.value })}
						/>
					</label>

					<label>
						Subscription
						<select
							value={form.subscriptionStatus}
							onChange={(event) =>
								setForm({
									...form,
									subscriptionStatus: event.target
										.value as CreateAdminOrganizationInput['subscriptionStatus'],
								})
							}
						>
							<option value="trial">trial</option>
							<option value="active">active</option>
							<option value="suspended">suspended</option>
							<option value="canceled">canceled</option>
						</select>
					</label>

					<label>
						Billing contact
						<input
							value={form.billingContactName}
							onChange={(event) => setForm({ ...form, billingContactName: event.target.value })}
						/>
					</label>

					<label>
						Billing email
						<input
							type="email"
							value={form.billingContactEmail}
							onChange={(event) => setForm({ ...form, billingContactEmail: event.target.value })}
						/>
					</label>

					<label className="full">
						Notes
						<textarea
							rows={3}
							value={form.subscriptionNotes}
							onChange={(event) => setForm({ ...form, subscriptionNotes: event.target.value })}
						/>
					</label>

					<label className="checkbox full">
						<input
							type="checkbox"
							checked={form.linkRequesterAsOwner}
							onChange={(event) => setForm({ ...form, linkRequesterAsOwner: event.target.checked })}
						/>
						Link me as owner
					</label>

					<button className="button" type="submit">
						Create agency
					</button>
				</form>

				{status === '' ? null : <p className="admin-status">{status}</p>}

				<div className="org-list">
					{organizations.map((organization) => (
						<article className="org-row" key={organization.id}>
							<div>
								<h3>
									<Link
										to="/admin/organizations/$organizationId"
										params={{ organizationId: organization.id }}
									>
										{organization.name}
									</Link>
								</h3>
								<p>{organization.workosOrganizationId ?? 'No WorkOS organization'}</p>
							</div>
							<dl className="facts">
								<Fact label="Subscription" value={organization.subscription.subscriptionStatus} />
								<Fact label="Billing" value={organization.subscription.billingMode} />
								<Fact
									label="Owner linked"
									value={organization.ownerLinked ? 'yes' : 'not on list'}
								/>
							</dl>
						</article>
					))}
				</div>
			</Panel>
		</section>
	);
}

function AdminOrganizationDetailRoute() {
	const { organizationId } = useParams({ from: adminOrganizationDetailRoute.id });
	const [organization, setOrganization] = useState<AdminOrganization | null>(null);
	const [memberships, setMemberships] = useState<AdminMembership[]>([]);
	const [status, setStatus] = useState<string>('Loading memberships...');
	const [inviteForm, setInviteForm] = useState<InviteAdminUserInput>({
		email: '',
		displayName: '',
		role: 'viewer',
	});

	useEffect(() => {
		let cancelled = false;

		listOrganizationMemberships(organizationId, serverUrl)
			.then((result) => {
				if (!cancelled) {
					setOrganization(result.organization);
					setMemberships(result.memberships);
					setStatus('');
				}
			})
			.catch((loadError: unknown) => {
				if (!cancelled) {
					setStatus(loadError instanceof Error ? loadError.message : 'Unable to load memberships.');
				}
			});

		return () => {
			cancelled = true;
		};
	}, [organizationId]);

	async function submitInvite(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus('Sending invitation...');

		try {
			const membership = await inviteAdminUser(organizationId, inviteForm, serverUrl);
			setMemberships((current) => [
				membership,
				...current.filter((item) => item.id !== membership.id),
			]);
			setInviteForm({
				email: '',
				displayName: '',
				role: 'viewer',
			});
			setStatus('Invitation sent.');
		} catch (inviteError) {
			setStatus(inviteError instanceof Error ? inviteError.message : 'Unable to invite user.');
		}
	}

	return (
		<section className="shell wide">
			<Panel title={organization === null ? 'Agency' : organization.name}>
				<Link className="back-link" to="/admin/organizations">
					Back to agencies
				</Link>

				{organization === null ? null : (
					<dl className="facts">
						<Fact label="SIMMER org" value={organization.id} />
						<Fact label="WorkOS org" value={organization.workosOrganizationId ?? 'none'} />
						<Fact label="Subscription" value={organization.subscription.subscriptionStatus} />
					</dl>
				)}

				<form className="admin-form invite-form" onSubmit={submitInvite}>
					<label>
						Email
						<input
							required
							type="email"
							value={inviteForm.email}
							onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
						/>
					</label>

					<label>
						Display name
						<input
							value={inviteForm.displayName}
							onChange={(event) =>
								setInviteForm({ ...inviteForm, displayName: event.target.value })
							}
						/>
					</label>

					<label>
						Role
						<select
							value={inviteForm.role}
							onChange={(event) =>
								setInviteForm({ ...inviteForm, role: event.target.value as SimmerRole })
							}
						>
							<option value="viewer">viewer</option>
							<option value="collector">collector</option>
							<option value="manager">manager</option>
							<option value="admin">admin</option>
							<option value="owner">owner</option>
						</select>
					</label>

					<button className="button" type="submit">
						Invite user
					</button>
				</form>

				{status === '' ? null : <p className="admin-status">{status}</p>}

				<div className="member-list">
					{memberships.map((membership) => (
						<article className="member-row" key={membership.id}>
							<div>
								<h3>{membership.profile.displayName}</h3>
								<p>{membership.profile.email ?? membership.invitedEmail ?? 'No email'}</p>
							</div>
							<dl className="facts">
								<Fact label="Role" value={membership.role} />
								<Fact label="Status" value={membership.status} />
								<Fact label="User" value={membership.userId ?? 'pending'} />
							</dl>
						</article>
					))}
				</div>
			</Panel>
		</section>
	);
}

function AuthenticatedPanel({ auth }: { readonly auth: AuthenticatedMe }) {
	const membershipStatus = auth.localIdentity.membershipId === null ? 'missing' : 'active';
	const organization = auth.localIdentity.organizationId ?? auth.workosOrganizationId ?? 'none';
	const profile = auth.localIdentity.profileId ?? 'none';
	const role = auth.localIdentity.role ?? 'none';

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
	body,
}: {
	readonly tone: 'danger' | 'warning';
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

function Panel({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
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

const rootElement = document.getElementById('root');
if (rootElement === null) {
	throw new Error('Root element not found.');
}

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
