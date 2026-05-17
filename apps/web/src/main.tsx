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
import { type FormEvent, StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminFoundationsPanel } from './AdminFoundations';
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
import { createWebCollections, preloadWebBaselineCollections } from './sync/collections';
import { useCollectionRows } from './sync/useCollectionRows';

interface RootSearch {
	readonly auth?: 'organization_required';
}

const serverUrl = getServerUrl();
const collections = createWebCollections({ serverUrl });

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
		<>
			{authState?.authenticated === true ? <AppTopbar /> : null}
			<section className={authState?.authenticated === false ? 'landing-shell' : 'shell'}>
				{search.auth === 'organization_required' ? (
					<Notice
						tone="warning"
						title="Organization required"
						body="Choose or join an organization, then sign in again."
					/>
				) : null}

				{error === null ? null : <Notice tone="danger" title="Sign-in unavailable" body={error} />}

				{authState === null && error === null ? (
					<Panel title="Checking session">
						<p>Loading session...</p>
					</Panel>
				) : null}

				{authState?.authenticated === false ? (
					<UnauthenticatedPanel reason={authState.reason} />
				) : null}

				{authState?.authenticated === true ? <AuthenticatedPanel auth={authState} /> : null}
			</section>
		</>
	);
}

function LoginRoute() {
	return (
		<section className="landing-shell">
			<SignInLanding reason={null} />
		</section>
	);
}

function AppTopbar() {
	return (
		<header className="topbar">
			<Link className="brand" to="/">
				<img src="/logo.svg" alt="" />
				<span>SIMMER</span>
			</Link>
			<nav>
				<Link to="/admin/organizations">Admin</Link>
				<Link to="/login">Login</Link>
			</nav>
		</header>
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
		mainContactEmail: '',
		phoneNumber: '',
		mailingCountry: '',
		mailingAddressLine1: '',
		mailingAddressLine2: '',
		mailingLocality: '',
		mailingRegion: '',
		mailingPostalCode: '',
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
				mainContactEmail: '',
				phoneNumber: '',
				mailingCountry: '',
				mailingAddressLine1: '',
				mailingAddressLine2: '',
				mailingLocality: '',
				mailingRegion: '',
				mailingPostalCode: '',
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
		<>
			<AppTopbar />
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
							Main contact email
							<input
								type="email"
								value={form.mainContactEmail}
								onChange={(event) => setForm({ ...form, mainContactEmail: event.target.value })}
							/>
						</label>

						<label>
							Phone
							<input
								value={form.phoneNumber}
								onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
							/>
						</label>

						<label>
							Country
							<input
								maxLength={2}
								value={form.mailingCountry}
								onChange={(event) => setForm({ ...form, mailingCountry: event.target.value })}
							/>
						</label>

						<label className="full">
							Address line 1
							<input
								value={form.mailingAddressLine1}
								onChange={(event) => setForm({ ...form, mailingAddressLine1: event.target.value })}
							/>
						</label>

						<label className="full">
							Address line 2
							<input
								value={form.mailingAddressLine2}
								onChange={(event) => setForm({ ...form, mailingAddressLine2: event.target.value })}
							/>
						</label>

						<label>
							Locality
							<input
								value={form.mailingLocality}
								onChange={(event) => setForm({ ...form, mailingLocality: event.target.value })}
							/>
						</label>

						<label>
							Region
							<input
								value={form.mailingRegion}
								onChange={(event) => setForm({ ...form, mailingRegion: event.target.value })}
							/>
						</label>

						<label>
							Postal code
							<input
								value={form.mailingPostalCode}
								onChange={(event) => setForm({ ...form, mailingPostalCode: event.target.value })}
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
								onChange={(event) =>
									setForm({ ...form, linkRequesterAsOwner: event.target.checked })
								}
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
									<p>{organization.workosOrganizationId ?? 'External identity not linked'}</p>
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
		</>
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
		<>
			<AppTopbar />
			<section className="shell wide">
				<Panel title={organization === null ? 'Agency' : organization.name}>
					<Link className="back-link" to="/admin/organizations">
						Back to agencies
					</Link>

					{organization === null ? null : (
						<dl className="facts">
							<Fact label="SIMMER org" value={organization.id} />
							<Fact label="Identity org" value={organization.workosOrganizationId ?? 'none'} />
							<Fact label="Subscription" value={organization.subscription.subscriptionStatus} />
							<Fact label="Main contact" value={organization.contact.mainContactEmail ?? 'none'} />
							<Fact label="Phone" value={organization.contact.phoneNumber ?? 'none'} />
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

					<AdminFoundationsPanel organizationId={organizationId} serverUrl={serverUrl} />
				</Panel>
			</section>
		</>
	);
}

function AuthenticatedPanel({ auth }: { readonly auth: AuthenticatedMe }) {
	const membershipStatus = auth.localIdentity.membershipId === null ? 'missing' : 'active';
	const organization = auth.localIdentity.organizationId ?? auth.workosOrganizationId ?? 'none';
	const profile = auth.localIdentity.profileId ?? 'none';
	const role = auth.localIdentity.role ?? 'none';
	const baselinePreloadError = useBaselinePreload(organization);

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

			{baselinePreloadError === null ? null : (
				<Notice tone="danger" title="Sync unavailable" body={baselinePreloadError} />
			)}

			<ProfilesSyncPanel />
			<LookupCatalogsSyncPanel />
			<OrganizationSpeciesSyncPanel />
			<TagsSyncPanel />
			<RoutesSyncPanel />
			<UnitsSyncPanel />
		</Panel>
	);
}

function useBaselinePreload(organization: string): string | null {
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (organization === 'none') {
			return;
		}

		let cancelled = false;
		setError(null);

		preloadWebBaselineCollections(collections).catch((preloadError: unknown) => {
			if (!cancelled) {
				setError(
					preloadError instanceof Error
						? preloadError.message
						: 'Unable to preload baseline sync collections.',
				);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [organization]);

	return error;
}

function ProfilesSyncPanel() {
	const { rows, status } = useCollectionRows(collections.profiles);

	return (
		<section className="sync-section">
			<div className="section-heading">
				<h3>Synced profiles</h3>
				<span>{status}</span>
			</div>
			<div className="unit-grid">
				{rows.map((profile) => (
					<div className="unit-row" key={profile.id}>
						<strong>{profile.displayName}</strong>
						<span>{profile.isActive ? 'active' : 'inactive'}</span>
						<small>{profile.id}</small>
					</div>
				))}
			</div>
		</section>
	);
}

function LookupCatalogsSyncPanel() {
	const { rows: collectionMethodRows, status: collectionMethodStatus } = useCollectionRows(
		collections.collectionMethods,
	);
	const { rows: collectionLureRows, status: collectionLureStatus } = useCollectionRows(
		collections.collectionLures,
	);
	const { rows: habitatTypeRows, status: habitatTypeStatus } = useCollectionRows(
		collections.habitatTypes,
	);

	return (
		<section className="sync-section">
			<div className="section-heading">
				<h3>Synced lookup catalogs</h3>
				<span>
					methods {collectionMethodStatus} / lures {collectionLureStatus} / habitats{' '}
					{habitatTypeStatus}
				</span>
			</div>
			<div className="lookup-catalog-grid">
				<LookupCatalogList title="Collection methods" rows={collectionMethodRows} />
				<LookupCatalogList title="Collection lures" rows={collectionLureRows} />
				<LookupCatalogList title="Habitat types" rows={habitatTypeRows} />
			</div>
		</section>
	);
}

function LookupCatalogList({
	title,
	rows,
}: {
	readonly title: string;
	readonly rows: readonly {
		readonly id: string;
		readonly name: string;
		readonly description: string | null;
		readonly isActive: boolean;
	}[];
}) {
	const sortedRows = [...rows].sort((left, right) => {
		if (left.isActive !== right.isActive) {
			return left.isActive ? -1 : 1;
		}

		return left.name.localeCompare(right.name);
	});

	return (
		<div className="lookup-catalog">
			<h4>{title}</h4>
			<div className="unit-grid">
				{sortedRows.map((row) => (
					<div className="unit-row" key={row.id}>
						<strong>{row.name}</strong>
						<span>{row.isActive ? 'active' : 'inactive'}</span>
						<small>{row.description ?? row.id}</small>
					</div>
				))}
			</div>
		</div>
	);
}

function OrganizationSpeciesSyncPanel() {
	const { rows: generaRows, status: generaStatus } = useCollectionRows(collections.genera);
	const { rows: speciesRows, status: speciesStatus } = useCollectionRows(collections.species);
	const { rows: organizationSpeciesRows, status: organizationSpeciesStatus } = useCollectionRows(
		collections.organizationSpecies,
	);

	const generaById = useMemo(() => {
		const lookup = new Map<string, (typeof generaRows)[number]>();

		for (const genus of generaRows) {
			lookup.set(genus.id, genus);
		}

		return lookup;
	}, [generaRows]);

	const speciesById = useMemo(() => {
		const lookup = new Map<string, (typeof speciesRows)[number]>();

		for (const species of speciesRows) {
			lookup.set(species.id, species);
		}

		return lookup;
	}, [speciesRows]);

	const selectedSpecies = useMemo(
		() =>
			organizationSpeciesRows
				.map((organizationSpecies) => {
					const species = speciesById.get(organizationSpecies.speciesId);
					const genus = species?.genusId === null ? null : generaById.get(species?.genusId ?? '');
					const fallbackLabel = species?.displayName ?? organizationSpecies.speciesId;
					const scientificLabel =
						species === undefined
							? organizationSpecies.speciesId
							: species.genusId === null
								? species.epithet
								: `${genus?.name ?? 'Unknown genus'} ${species.epithet}`;

					return {
						id: organizationSpecies.id,
						label: fallbackLabel,
						scientificLabel,
					};
				})
				.sort((left, right) => left.label.localeCompare(right.label)),
		[generaById, organizationSpeciesRows, speciesById],
	);

	return (
		<section className="sync-section">
			<div className="section-heading">
				<h3>Synced organization species</h3>
				<span>
					{organizationSpeciesStatus} / species {speciesStatus} / genera {generaStatus}
				</span>
			</div>
			<div className="unit-grid">
				{selectedSpecies.map((species) => (
					<div className="unit-row" key={species.id}>
						<strong>{species.label}</strong>
						<span>selected</span>
						<small>{species.scientificLabel}</small>
					</div>
				))}
			</div>
		</section>
	);
}

function TagsSyncPanel() {
	const { rows, status } = useCollectionRows(collections.tags);

	return (
		<section className="sync-section">
			<div className="section-heading">
				<h3>Synced tags</h3>
				<span>{status}</span>
			</div>
			<div className="unit-grid">
				{rows.map((tag) => (
					<div className="unit-row" key={tag.id}>
						<strong>{tag.tagName}</strong>
						<span>{tag.isActive ? 'active' : 'inactive'}</span>
						<small>{tag.color ?? 'no color'}</small>
					</div>
				))}
			</div>
		</section>
	);
}

function RoutesSyncPanel() {
	const { rows, status } = useCollectionRows(collections.routes);

	return (
		<section className="sync-section">
			<div className="section-heading">
				<h3>Synced route headers</h3>
				<span>{status}</span>
			</div>
			<div className="unit-grid">
				{rows.map((route) => (
					<div className="unit-row" key={route.id}>
						<strong>{route.routeName}</strong>
						<span>{route.routeType}</span>
						<small>{route.id}</small>
					</div>
				))}
			</div>
		</section>
	);
}

function UnitsSyncPanel() {
	const { rows, status } = useCollectionRows(collections.units);

	return (
		<section className="sync-section">
			<div className="section-heading">
				<h3>Synced units</h3>
				<span>{status}</span>
			</div>
			<div className="unit-grid">
				{rows.map((unit) => (
					<div className="unit-row" key={unit.id}>
						<strong>{unit.unitName}</strong>
						<span>{unit.abbreviation}</span>
						<small>
							{unit.unitType} / {unit.unitSystem}
						</small>
					</div>
				))}
			</div>
		</section>
	);
}

function UnauthenticatedPanel({ reason }: { readonly reason: string }) {
	return <SignInLanding reason={reason} />;
}

function SignInLanding({ reason }: { readonly reason: string | null }) {
	return (
		<div className="landing-panel">
			<img className="landing-logo" src="/logo.svg" alt="SIMMER" />
			<div className="landing-copy">
				<p className="eyebrow">Mosquito control operations</p>
				<h1>Coordinate field work with the map in view.</h1>
				<p>
					SIMMER brings surveillance, service requests, routes, control work, and agency setup into
					one operational workspace.
				</p>
			</div>
			<div className="landing-actions">
				<a className="button" href={`${serverUrl}/auth/login`}>
					Sign in
				</a>
				{reason === null ? null : <p>Session status: {reason}</p>}
			</div>
		</div>
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
