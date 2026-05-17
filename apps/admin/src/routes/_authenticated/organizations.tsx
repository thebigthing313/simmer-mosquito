import { createRoute, Link } from '@tanstack/react-router';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
	type AdminAgency,
	type CreateAdminAgencyInput,
	createAdminAgency,
	getServerUrl,
	listAdminAgencies,
} from '../../api';
import { Panel } from '../../components/Panel';
import { adminLayoutRoute } from './_admin';

const serverUrl = getServerUrl();

export const organizationsRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/organizations',
	component: OrganizationsRoute,
});

function OrganizationsRoute() {
	const createDialogRef = useRef<HTMLDialogElement>(null);
	const [organizations, setOrganizations] = useState<AdminAgency[]>([]);
	const [status, setStatus] = useState('Loading organizations...');
	const [form, setForm] = useState<CreateAdminAgencyInput>({
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
		listAdminAgencies(serverUrl)
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
			const organization = await createAdminAgency(form, serverUrl);
			setOrganizations((current) => [organization, ...current]);
			setForm({ ...emptyOrganizationForm(), subscriptionStatus: form.subscriptionStatus });
			createDialogRef.current?.close();
			setStatus('Organization created.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to create organization.');
		}
	}

	return (
		<section className="shell wide management-page">
			<header className="page-heading">
				<div>
					<p className="eyebrow">Customer setup</p>
					<h1>Organizations</h1>
					<p>Manage SIMMER customer organizations and the users connected to each one.</p>
				</div>
				<button
					className="button"
					type="button"
					onClick={() => createDialogRef.current?.showModal()}
				>
					New organization
				</button>
			</header>

			<Panel title="Customer organizations">
				<div className="panel-toolbar">
					<div>
						<p>Open an organization to invite users and review membership setup.</p>
					</div>
				</div>

				{status === '' ? null : <p className="status">{status}</p>}

				{organizations.length === 0 && status === '' ? (
					<div className="empty-state">
						<h2>No organizations yet</h2>
						<p>Create the first SIMMER customer organization when onboarding is ready.</p>
						<button
							className="button secondary"
							type="button"
							onClick={() => createDialogRef.current?.showModal()}
						>
							Create organization
						</button>
					</div>
				) : (
					<div className="list organization-list">
						{organizations.map((organization) => (
							<article className="row organization-row" key={organization.id}>
								<div className="organization-summary">
									<div className="organization-identity">
										<h3>{organization.name}</h3>
										<p className="code-text">
											{organization.workosOrganizationId ?? 'External identity not linked'}
										</p>
									</div>
									<div className="organization-meta">
										<div>
											<span>Subscription</span>
											<strong
												className={`badge ${subscriptionBadgeTone(
													organization.subscription.subscriptionStatus,
												)}`}
											>
												{organization.subscription.subscriptionStatus}
											</strong>
										</div>
										<div>
											<span>Main contact</span>
											<strong>{organization.contact.mainContactEmail ?? 'No main contact'}</strong>
										</div>
									</div>
								</div>
								<div className="row-actions">
									<Link
										className="button secondary"
										to="/organizations/$organizationId/users"
										params={{ organizationId: organization.id }}
									>
										Users
									</Link>
								</div>
							</article>
						))}
					</div>
				)}
			</Panel>

			<dialog
				className="drawer-dialog"
				ref={createDialogRef}
				aria-labelledby="create-organization-title"
			>
				<form method="dialog" className="drawer-close">
					<button
						aria-label="Close create organization dialog"
						className="button subtle"
						type="submit"
					>
						Close
					</button>
				</form>

				<div className="drawer-header">
					<h2 id="create-organization-title">New organization</h2>
					<p>
						Add the customer organization first, then manage its users from the organization list.
					</p>
				</div>

				<form className="form-grid drawer-form" onSubmit={submit}>
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
										.value as AdminAgency['subscription']['subscriptionStatus'],
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
					<div className="drawer-actions full">
						<button className="button" type="submit">
							Create organization
						</button>
					</div>
				</form>
			</dialog>
		</section>
	);
}

function subscriptionBadgeTone(status: AdminAgency['subscription']['subscriptionStatus']): string {
	if (status === 'active') {
		return 'success';
	}
	if (status === 'trial') {
		return 'info';
	}
	if (status === 'suspended') {
		return 'warning';
	}
	return 'danger';
}

function emptyOrganizationForm(): CreateAdminAgencyInput {
	return {
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
	};
}
