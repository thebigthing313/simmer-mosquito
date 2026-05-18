import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useEffect, useState } from 'react';
import {
	type AdminAgency,
	type AdminMembership,
	getServerUrl,
	type InviteAdminUserInput,
	inviteAdminUser,
	listAgencyMemberships,
	type MembershipStatus,
	type SimmerRole,
} from '../api';
import {
	AdminEmpty,
	BackLink,
	FactGrid,
	FormActions,
	FormGrid,
	LoadingRows,
	PageShell,
	StatusMessage,
} from '../components/AdminPrimitives';
import { Fact, Panel, type Tone } from '../components/Panel';

const serverUrl = getServerUrl();

export const Route = createFileRoute('/_authenticated/_admin/organizations/$organizationId/users')({
	component: OrganizationUsersRoute,
});

function OrganizationUsersRoute() {
	const { organizationId } = Route.useParams();
	const [organization, setOrganization] = useState<AdminAgency | null>(null);
	const [memberships, setMemberships] = useState<AdminMembership[]>([]);
	const [status, setStatus] = useState('Loading users...');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [form, setForm] = useState<InviteAdminUserInput>({
		email: '',
		displayName: '',
		role: 'viewer',
	});

	useEffect(() => {
		let cancelled = false;
		listAgencyMemberships(organizationId, serverUrl)
			.then((result) => {
				if (!cancelled) {
					setOrganization(result.organization);
					setMemberships(result.memberships);
					setStatus('');
				}
			})
			.catch((loadError: unknown) => {
				if (!cancelled) {
					setStatus(loadError instanceof Error ? loadError.message : 'Unable to load users.');
				}
			});

		return () => {
			cancelled = true;
		};
	}, [organizationId]);

	async function submitInvite(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (isSubmitting) {
			return;
		}
		const trimmedForm = trimInviteForm(form);
		if (trimmedForm.email === '') {
			setStatus('Email is required.');
			return;
		}
		setIsSubmitting(true);
		setStatus('Sending invitation...');
		try {
			const membership = await inviteAdminUser(organizationId, trimmedForm, serverUrl);
			setMemberships((current) => [
				membership,
				...current.filter((item) => item.id !== membership.id),
			]);
			setForm({ email: '', displayName: '', role: 'viewer' });
			setStatus('Invitation sent.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to invite user.');
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<PageShell>
			<Panel title={organization === null ? 'Organization users' : `${organization.name} users`}>
				<BackLink to="/organizations">Back to organizations</BackLink>

				<form className="grid gap-4" onSubmit={submitInvite}>
					<FormGrid compact>
						<Field>
							<FieldLabel>Email</FieldLabel>
							<Input
								required
								maxLength={254}
								type="email"
								value={form.email}
								onChange={(event) => setForm({ ...form, email: event.target.value })}
							/>
						</Field>
						<Field>
							<FieldLabel>Display name</FieldLabel>
							<Input
								maxLength={160}
								value={form.displayName}
								onChange={(event) => setForm({ ...form, displayName: event.target.value })}
							/>
						</Field>
						<Field>
							<FieldLabel>Role</FieldLabel>
							<NativeSelect
								value={form.role}
								onChange={(event) => setForm({ ...form, role: event.target.value as SimmerRole })}
							>
								<option value="viewer">viewer</option>
								<option value="collector">collector</option>
								<option value="manager">manager</option>
								<option value="admin">admin</option>
								<option value="owner">owner</option>
							</NativeSelect>
						</Field>
					</FormGrid>
					<FormActions>
						<Button disabled={isSubmitting} type="submit">
							{isSubmitting ? 'Sending...' : 'Invite user'}
						</Button>
					</FormActions>
				</form>

				<StatusMessage>{status}</StatusMessage>

				{status === 'Loading users...' ? (
					<LoadingRows label="Loading users" />
				) : memberships.length === 0 && status === '' ? (
					<AdminEmpty
						description="Invite an owner, admin, manager, collector, or viewer when the customer team is ready."
						title="No users connected"
					/>
				) : memberships.length > 0 ? (
					<div className="list">
						{memberships.map((membership) => (
							<article className="row" key={membership.id}>
								<div className="min-w-0">
									<h3>
										{membership.profile.displayName || membership.invitedEmail || 'Pending user'}
									</h3>
									<p>{membership.profile.email ?? membership.invitedEmail ?? 'No email'}</p>
								</div>
								<FactGrid>
									<Fact
										label="Role"
										value={membership.role}
										tone={roleBadgeTone(membership.role)}
									/>
									<Fact
										label="Status"
										value={membership.status}
										tone={membershipStatusBadgeTone(membership.status)}
									/>
									<Fact label="User" value={membership.userId ?? 'pending'} />
								</FactGrid>
							</article>
						))}
					</div>
				) : null}
			</Panel>
		</PageShell>
	);
}

function trimInviteForm(form: InviteAdminUserInput): InviteAdminUserInput {
	return {
		...form,
		email: form.email.trim(),
		displayName: form.displayName.trim(),
	};
}

function roleBadgeTone(role: SimmerRole): Tone {
	if (role === 'owner' || role === 'admin') {
		return 'catalog';
	}
	if (role === 'manager') {
		return 'info';
	}
	if (role === 'collector') {
		return 'success';
	}
	return 'neutral';
}

function membershipStatusBadgeTone(status: MembershipStatus): Tone {
	if (status === 'active') {
		return 'success';
	}
	if (status === 'invited') {
		return 'info';
	}
	return 'neutral';
}
