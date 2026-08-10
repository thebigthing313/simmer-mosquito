import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { ListEmpty, ListLoading } from '@simmer-mosquito/ui-web/components/page';
import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import {
	type AdminMembership,
	type InviteAdminUserInput,
	type InviteAdminUserResult,
	inviteAdminUser,
} from '../../../api';
import { AdminError, AdminPage } from '../../../components/admin-page';
import { membershipStatusTone, roleTone } from '../../../lib/tones';
import { useAgencyMemberships, useInvalidateAgencies } from '../-agency-data';

const ContactIcon = iconRegistry.entities.contact.icon;
const SendIcon = iconRegistry.actions.send.icon;

export const Route = createFileRoute('/organizations/$organizationId/members')({
	component: AgencyMembersRoute,
});

/**
 * The role list, ordered by privilege from least to most.
 *
 * The ladder itself is the server's (`apps/server/src/roles.ts`); this is only
 * its presentation. Viewer leads because it is the safe default for an
 * invitation whose recipient you have not spoken to.
 */
const ROLE_OPTIONS = [
	{ value: 'viewer', label: 'Viewer — read only' },
	{ value: 'collector', label: 'Collector — records field work' },
	{ value: 'manager', label: 'Manager — records and manages catalogs' },
	{ value: 'admin', label: 'Admin — manages the agency' },
	{ value: 'owner', label: 'Owner — full control' },
];

function AgencyMembersRoute() {
	const { organizationId } = Route.useParams();
	const { data, isPending, error } = useAgencyMemberships(organizationId);
	const invalidateAgencies = useInvalidateAgencies();
	const [inviteError, setInviteError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { email: '', displayName: '', role: 'viewer' } as InviteAdminUserInput,
		onSubmit: async ({ value, formApi }) => {
			setInviteError(null);
			try {
				const result = await inviteAdminUser(organizationId, {
					email: value.email.trim(),
					displayName: value.displayName.trim(),
					role: value.role,
				});
				await invalidateAgencies();
				formApi.reset();
				toast.success(inviteOutcome(result, value));
			} catch (caught) {
				setInviteError(caught instanceof Error ? caught.message : 'Unable to send the invitation.');
			}
		},
	});

	const memberships = [...(data?.memberships ?? [])].sort((a, b) =>
		memberLabel(a).localeCompare(memberLabel(b)),
	);

	return (
		<AdminPage
			description="People connected to this agency. An invitation creates a WorkOS invite and a pending membership at the role you choose."
			icon={ContactIcon}
			title={data === undefined ? 'Members' : `${data.organization.name} — Members`}
		>
			{error !== null ? (
				<AdminError error={error} />
			) : (
				<div className="grid gap-5">
					<Panel
						count={isPending ? undefined : memberships.length}
						icon={<ContactIcon aria-hidden="true" />}
						title="Members"
					>
						{isPending ? (
							<div className="p-4">
								<ListLoading rows={3} />
							</div>
						) : memberships.length === 0 ? (
							<div className="p-4">
								<ListEmpty
									description="Invite the agency's first owner or admin below."
									title="Nobody Connected Yet"
								/>
							</div>
						) : (
							<ul className="m-0 grid list-none gap-px bg-border/60 p-0">
								{memberships.map((membership) => (
									<MemberRow key={membership.id} membership={membership} />
								))}
							</ul>
						)}
					</Panel>

					<Panel icon={<SendIcon aria-hidden="true" />} title="Invite Someone">
						<form.AppForm>
							<form
								className="grid gap-5 p-4"
								onSubmit={(event) => {
									event.preventDefault();
									void form.handleSubmit();
								}}
							>
								<form.FormErrorAlert title="Unable to Send Invitation" />
								{inviteError === null ? null : (
									<Alert variant="destructive">
										<AlertTitle>Unable to Send Invitation</AlertTitle>
										<AlertDescription>{inviteError}</AlertDescription>
									</Alert>
								)}
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField
										name="email"
										validators={{
											onSubmit: ({ value }: { readonly value: string }) =>
												value.trim().length === 0 ? 'Email is required.' : undefined,
										}}
									>
										{(field) => (
											<field.TextField label="Email" maxLength={254} required type="email" />
										)}
									</form.AppField>
									<form.AppField name="displayName">
										{(field) => (
											<field.TextField
												description="Used for attribution until they sign in and set their own."
												label="Display name"
												maxLength={160}
											/>
										)}
									</form.AppField>
								</div>
								<form.AppField name="role">
									{(field) => <field.SelectField label="Role" options={ROLE_OPTIONS} required />}
								</form.AppField>
								<div className="flex justify-end">
									<form.SubmitButton>Send Invitation</form.SubmitButton>
								</div>
							</form>
						</form.AppForm>
					</Panel>
				</div>
			)}
		</AdminPage>
	);
}

/**
 * Two outcomes wear the same 201, and the difference matters to the reader: an
 * invitation is waiting in somebody's inbox, or it is not because they can
 * already get in and only the role was new.
 */
function inviteOutcome(result: InviteAdminUserResult, sent: InviteAdminUserInput): string {
	const email = result.membership.invitedEmail ?? sent.email.trim();
	return result.invitation === null
		? `${email} already has access. The ${sent.role} role applies next time they enter this agency.`
		: `Invitation sent to ${email}.`;
}

function memberLabel(membership: AdminMembership): string {
	return membership.profile.displayName || membership.invitedEmail || 'Pending member';
}

function MemberRow({ membership }: { readonly membership: AdminMembership }) {
	return (
		<li className="flex items-center gap-3 bg-card px-4 py-3">
			<div className="min-w-0 flex-1">
				<p className="m-0 truncate font-medium text-foreground text-sm">
					{memberLabel(membership)}
				</p>
				<p className="mt-0.5 mb-0 truncate text-muted-foreground text-xs">
					{membership.profile.email ?? membership.invitedEmail ?? 'No email'}
				</p>
			</div>
			{/*
			 * A membership with no `userId` has been invited but never signed in.
			 * That is the difference between "they cannot find the email" and "they
			 * are set up", so it is named rather than left to be inferred from the
			 * status pill alone.
			 */}
			{membership.userId === null ? (
				<Badge tone="neutral" variant="outline">
					No login yet
				</Badge>
			) : null}
			{membership.isDefault ? (
				<Badge tone="neutral" variant="outline">
					Default
				</Badge>
			) : null}
			<Badge
				className="capitalize"
				tone={membershipStatusTone(membership.status)}
				variant="outline"
			>
				{membership.status}
			</Badge>
			<Badge className="capitalize" tone={roleTone(membership.role)} variant="outline">
				{membership.role}
			</Badge>
		</li>
	);
}
