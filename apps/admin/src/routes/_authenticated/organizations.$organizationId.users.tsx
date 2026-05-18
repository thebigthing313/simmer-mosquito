import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { createRoute, Link, useParams } from '@tanstack/react-router';
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
} from '../../api';
import { Fact, Panel, type Tone } from '../../components/Panel';
import { adminLayoutRoute } from './_admin';

const serverUrl = getServerUrl();

export const organizationUsersRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/organizations/$organizationId/users',
	component: OrganizationUsersRoute,
});

function OrganizationUsersRoute() {
	const { organizationId } = useParams({ from: organizationUsersRoute.id });
	const [organization, setOrganization] = useState<AdminAgency | null>(null);
	const [memberships, setMemberships] = useState<AdminMembership[]>([]);
	const [status, setStatus] = useState('Loading users...');
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
		setStatus('Sending invitation...');
		try {
			const membership = await inviteAdminUser(organizationId, form, serverUrl);
			setMemberships((current) => [
				membership,
				...current.filter((item) => item.id !== membership.id),
			]);
			setForm({ email: '', displayName: '', role: 'viewer' });
			setStatus('Invitation sent.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to invite user.');
		}
	}

	return (
		<section className="shell wide">
			<Panel title={organization === null ? 'Organization users' : `${organization.name} users`}>
				<Link className="back-link" to="/organizations">
					Back to organizations
				</Link>

				<form className="form-grid compact" onSubmit={submitInvite}>
					<Label>
						Email
						<Input
							required
							type="email"
							value={form.email}
							onChange={(event) => setForm({ ...form, email: event.target.value })}
						/>
					</Label>
					<Label>
						Display name
						<Input
							value={form.displayName}
							onChange={(event) => setForm({ ...form, displayName: event.target.value })}
						/>
					</Label>
					<Label>
						Role
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
					</Label>
					<Button type="submit">Invite user</Button>
				</form>

				{status === '' ? null : <p className="status">{status}</p>}

				<div className="list">
					{memberships.map((membership) => (
						<article className="row" key={membership.id}>
							<div>
								<h3>{membership.profile.displayName}</h3>
								<p>{membership.profile.email ?? membership.invitedEmail ?? 'No email'}</p>
							</div>
							<dl className="facts">
								<Fact label="Role" value={membership.role} tone={roleBadgeTone(membership.role)} />
								<Fact
									label="Status"
									value={membership.status}
									tone={membershipStatusBadgeTone(membership.status)}
								/>
								<Fact label="User" value={membership.userId ?? 'pending'} />
							</dl>
						</article>
					))}
				</div>
			</Panel>
		</section>
	);
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
