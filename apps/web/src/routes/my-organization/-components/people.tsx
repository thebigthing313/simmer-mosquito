import type { MembershipRow, Organization, ProfileRow } from '@simmer-mosquito/sync';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@simmer-mosquito/ui-web/components/ui/sheet';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { type Collection, eq, isNull, not, useLiveSuspenseQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { type AuthMe, getServerUrl } from '../../../auth';
import { canManageRoles, canRemoveMember, grantableRoles } from '../../../lib/write-access';
import {
	inviteOrganizationProfile,
	removeOrganizationMembership,
	updateOrganizationMembershipRole,
} from '../../../sync/profileMutations';
import { AddIcon, CloseIcon, DeleteIcon, EditIcon, ORG_ROLE_OPTIONS, SaveIcon } from './constants';
import {
	createHistoricalProfile,
	errorMessageForSave,
	formatRole,
	requiredTextValue,
	updateProfile,
	watchPersistence,
} from './helpers';
import { OrgSurface } from './layout/layout';
import { OrgSection } from './layout/org-section';
import { SectionHeader } from './layout/section-header';
import type { OrgRole } from './types';

export function PeopleSection({
	auth,
	canManage,
	memberships,
	organization,
	profiles,
	role,
}: {
	readonly auth: AuthMe | null;
	readonly canManage: boolean;
	readonly memberships: Collection<MembershipRow, string | number>;
	readonly organization: Organization;
	readonly profiles: Collection<ProfileRow, string | number>;
	readonly role: OrgRole;
}) {
	const localIdentity = auth?.authenticated === true ? auth.localIdentity : null;
	const user = auth?.authenticated === true ? auth.user : null;
	const activeLinkedRows = useProfileMembershipRows(profiles, memberships, 'activeLinked');
	const inactiveLinkedRows = useProfileMembershipRows(profiles, memberships, 'inactiveLinked');
	const historicalRows = useProfileMembershipRows(profiles, memberships, 'historical');
	const currentProfile =
		activeLinkedRows.find((row) => row.profile.id === localIdentity?.profileId)?.profile ??
		inactiveLinkedRows.find((row) => row.profile.id === localIdentity?.profileId)?.profile ??
		historicalRows.find((row) => row.profile.id === localIdentity?.profileId)?.profile;
	const displayName = currentProfile?.displayName ?? user?.displayName ?? 'Current member';
	const email = user?.email ?? null;
	const [isAddingHistorical, setIsAddingHistorical] = useState(false);
	const [isInviting, setIsInviting] = useState(false);
	// Managing people and handing out a role are two floors, not one: an admin
	// onboards, an owner promotes. Offering the control to an admin would mean a
	// form filled in and then 403'd on save.
	const canEditRole = canManageRoles(auth);

	return (
		<OrgSection id="people">
			<OrgSurface>
				<SectionHeader
					action={
						canManage ? (
							<div className="flex flex-wrap justify-end gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setIsAddingHistorical(true)}
								>
									<AddIcon aria-hidden="true" />
									Historical Profile
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setIsInviting(true)}
								>
									<AddIcon aria-hidden="true" />
									Invite
								</Button>
							</div>
						) : undefined
					}
					meta="Profile records, current access, and field history"
					title="People"
				/>
				<div className="grid gap-3">
					<article className="grid min-w-0 items-center gap-3 rounded-md border border-border/40 bg-muted/40 p-2.5 md:grid-cols-[minmax(240px,1fr)_auto]">
						<div className="min-w-0">
							<span className="font-medium wrap-anywhere text-sm text-foreground">
								{displayName}
							</span>
							<p className="m-0 text-sm leading-snug text-muted-foreground">
								{email ?? 'No email available'}
							</p>
						</div>
						<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
							{formatRole(role)}
						</Badge>
					</article>
					<ProfileGroup
						auth={auth}
						canEditRole={canEditRole}
						canManage={canManage}
						emptyLabel="No active linked profiles"
						rows={activeLinkedRows}
						title="Active Linked Profiles"
					/>
					<ProfileGroup
						auth={auth}
						canEditRole={canEditRole}
						canManage={canManage}
						emptyLabel="No inactive linked profiles"
						rows={inactiveLinkedRows}
						title="Inactive Linked Profiles"
					/>
					<ProfileGroup
						auth={auth}
						canEditRole={canEditRole}
						canManage={canManage}
						emptyLabel="No historical profiles"
						rows={historicalRows}
						title="Historical Profiles"
					/>
				</div>
				{canManage ? (
					<>
						<HistoricalProfileSheet
							open={isAddingHistorical}
							onOpenChange={setIsAddingHistorical}
							organization={organization}
						/>
						<InviteProfileSheet
							auth={auth}
							open={isInviting}
							onOpenChange={setIsInviting}
							profiles={historicalRows
								.filter(({ profile }) => profile.isActive)
								.map(({ profile }) => profile)}
						/>
					</>
				) : null}
			</OrgSurface>
		</OrgSection>
	);
}

type ProfileMembershipGroup = 'activeLinked' | 'inactiveLinked' | 'historical';

interface ProfileMembershipRow {
	readonly profile: ProfileRow;
	readonly membership: MembershipRow | null | undefined;
}

function useProfileMembershipRows(
	profiles: Collection<ProfileRow, string | number>,
	memberships: Collection<MembershipRow, string | number>,
	group: ProfileMembershipGroup,
): readonly ProfileMembershipRow[] {
	const result = useLiveSuspenseQuery(
		(query) => {
			let profileQuery = query
				.from({ profile: profiles })
				.leftJoin({ membership: memberships }, ({ profile, membership }) =>
					eq(profile.id, membership.profileId),
				);

			switch (group) {
				case 'activeLinked':
					profileQuery = profileQuery
						.where(({ profile }) => not(isNull(profile.userId)))
						.where(({ profile }) => eq(profile.isActive, true))
						.orderBy(({ profile }) => profile.displayName, 'asc');
					break;
				case 'inactiveLinked':
					profileQuery = profileQuery
						.where(({ profile }) => not(isNull(profile.userId)))
						.where(({ profile }) => eq(profile.isActive, false))
						.orderBy(({ profile }) => profile.displayName, 'asc');
					break;
				case 'historical':
					profileQuery = profileQuery
						.where(({ profile }) => isNull(profile.userId))
						.orderBy(({ profile }) => profile.isActive, 'desc')
						.orderBy(({ profile }) => profile.displayName, 'asc');
					break;
			}

			return profileQuery;
		},
		[profiles, memberships, group],
	);

	return result.data;
}

function ProfileGroup({
	auth,
	canEditRole,
	canManage,
	emptyLabel,
	rows,
	title,
}: {
	readonly auth: AuthMe | null;
	readonly canEditRole: boolean;
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly rows: readonly ProfileMembershipRow[];
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
				<h3 className="eyebrow m-0">{title}</h3>
				<Badge tone="neutral" variant="outline">
					{rows.length}
				</Badge>
			</div>
			{rows.length === 0 ? (
				<p className="m-0 rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="grid gap-2">
					{rows.map(({ membership, profile }) => (
						<ProfileRowItem
							auth={auth}
							canEditRole={canEditRole}
							canManage={canManage}
							key={profile.id}
							membership={membership ?? null}
							profile={profile}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function ProfileRowItem({
	auth,
	canEditRole,
	canManage,
	membership,
	profile,
}: {
	readonly auth: AuthMe | null;
	readonly canEditRole: boolean;
	readonly canManage: boolean;
	readonly membership: MembershipRow | null;
	readonly profile: ProfileRow;
}) {
	return (
		<article className="grid min-w-0 items-start gap-3 rounded-md border border-border/40 bg-card px-3 py-2.5 md:grid-cols-[minmax(220px,1fr)_auto]">
			<div className="grid min-w-0 gap-1">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<span className="font-medium wrap-anywhere text-sm leading-snug text-foreground">
						{profile.displayName}
					</span>
					<Badge tone={profile.isActive ? 'success' : 'neutral'} variant="outline">
						{profile.isActive ? 'Active' : 'Inactive'}
					</Badge>
					<Badge tone={profile.userId === null ? 'neutral' : 'info'} variant="outline">
						{profile.userId === null ? 'Historical' : 'Linked'}
					</Badge>
					{membership === null ? null : (
						<Badge tone={membership.status === 'active' ? 'success' : 'neutral'} variant="outline">
							{formatRole(membership.role)}
						</Badge>
					)}
				</div>
				<p className="m-0 text-sm leading-snug text-muted-foreground">
					{profile.email ?? 'No login link'}
				</p>
			</div>
			{/* One grid cell, however many actions: the article's second column is
			    where a row's controls go, and a bare sibling would take a row of
			    its own. */}
			<div className="flex items-center gap-2">
				{/* Straight from the roster to this person's day. Not gated on
				    `canManage`: agency records are readable by anyone in the agency,
				    and the Activity Monitor is an ordinary agency read. */}
				<Button asChild size="sm" variant="outline">
					<Link search={{ profile: profile.id }} to="/activity-monitor">
						Activity
					</Link>
				</Button>
				{canManage ? (
					<EditProfileSheet
						auth={auth}
						canEditRole={canEditRole}
						membership={membership}
						profile={profile}
					/>
				) : null}
			</div>
		</article>
	);
}

function HistoricalProfileSheet({
	onOpenChange,
	open,
	organization,
}: {
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
	readonly organization: Organization;
}) {
	const [displayName, setDisplayName] = useState('');
	const [isActive, setIsActive] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setDisplayName('');
			setIsActive(false);
			setError(null);
		}
		onOpenChange(nextOpen);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			const transaction = createHistoricalProfile(organization, {
				displayName,
				isActive,
			});
			updateOpen(false);
			watchPersistence(transaction, 'Unable to add historical profile.');
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		}
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetContent className="w-[min(420px,100%)]">
				<SheetHeader>
					<SheetTitle>Add Historical Profile</SheetTitle>
					<SheetDescription>
						Create a person record for field history without inviting them to SIMMER.
					</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-3 px-4">
						<Field className="gap-1">
							<FieldLabel>Display name</FieldLabel>
							<Input
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder="Name used on historical records"
							/>
						</Field>
						<div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-3 py-2 font-medium text-sm">
							<span>Active for assignment</span>
							<Switch checked={isActive} onCheckedChange={setIsActive} />
						</div>
						{error === null ? null : (
							<p className="m-0 text-sm leading-snug text-destructive">{error}</p>
						)}
					</div>
					<SheetFooter>
						<Button type="submit">
							<SaveIcon aria-hidden="true" />
							Save Profile
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								<CloseIcon data-icon="inline-start" aria-hidden="true" />
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function InviteProfileSheet({
	auth,
	onOpenChange,
	open,
	profiles,
}: {
	readonly auth: AuthMe | null;
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
	readonly profiles: readonly ProfileRow[];
}) {
	const roleOptions = grantableRoles(auth);
	const [displayName, setDisplayName] = useState('');
	const [email, setEmail] = useState('');
	const [role, setRole] = useState<OrgRole>('viewer');
	const [profileId, setProfileId] = useState('new');
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setDisplayName('');
			setEmail('');
			setRole('viewer');
			setProfileId('new');
			setError(null);
		}
		onOpenChange(nextOpen);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSaving(true);
		try {
			await inviteOrganizationProfile(getServerUrl(), {
				displayName,
				email,
				role,
				profileId: profileId === 'new' ? null : profileId,
			});
			toast.success('Invitation sent.');
			updateOpen(false);
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetContent className="w-[min(440px,100%)]">
				<SheetHeader>
					<SheetTitle>Invite Linked Profile</SheetTitle>
					<SheetDescription>
						Send an invitation and create or attach the access profile for this organization.
					</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-3 px-4">
						<Field className="gap-1">
							<FieldLabel>Historical profile</FieldLabel>
							<Select value={profileId} onValueChange={setProfileId}>
								<SelectTrigger size="sm" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="new">Create a new linked profile</SelectItem>
									{profiles.map((profile) => (
										<SelectItem key={profile.id} value={profile.id}>
											{profile.displayName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field className="gap-1">
							<FieldLabel>Email</FieldLabel>
							<Input
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder="person@example.gov"
							/>
						</Field>
						<Field className="gap-1">
							<FieldLabel>Display name</FieldLabel>
							<Input
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder="Optional, defaults to email"
							/>
						</Field>
						<Field className="gap-1">
							<FieldLabel>Role</FieldLabel>
							<Select value={role} onValueChange={(value) => setRole(value as OrgRole)}>
								<SelectTrigger size="sm" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{roleOptions.map((option) => (
										<SelectItem key={option} value={option}>
											{formatRole(option)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						{error === null ? null : (
							<p className="m-0 text-sm leading-snug text-destructive">{error}</p>
						)}
					</div>
					<SheetFooter>
						<Button type="submit" disabled={isSaving}>
							<SaveIcon aria-hidden="true" />
							Send Invite
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								<CloseIcon data-icon="inline-start" aria-hidden="true" />
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function EditProfileSheet({
	auth,
	canEditRole,
	membership,
	profile,
}: {
	readonly auth: AuthMe | null;
	readonly canEditRole: boolean;
	readonly membership: MembershipRow | null;
	readonly profile: ProfileRow;
}) {
	const [open, setOpen] = useState(false);
	const [displayName, setDisplayName] = useState(profile.displayName);
	const [isActive, setIsActive] = useState(profile.isActive);
	const [role, setRole] = useState<OrgRole>(membership?.role ?? 'viewer');
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setDisplayName(profile.displayName);
			setIsActive(profile.isActive);
			setRole(membership?.role ?? 'viewer');
			setError(null);
			setIsSaving(false);
		}
		setOpen(nextOpen);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSaving(true);
		try {
			const nextDisplayName = requiredTextValue(displayName, 'Display name');
			if (membership !== null && role !== membership.role) {
				await updateOrganizationMembershipRole(getServerUrl(), membership.id, role);
			}
			const transaction = updateProfile(profile, { displayName: nextDisplayName, isActive });
			updateOpen(false);
			watchPersistence(transaction, 'Unable to save profile.');
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(420px,100%)]">
				<SheetHeader>
					<SheetTitle>Edit {profile.displayName}</SheetTitle>
					<SheetDescription>
						Update the profile label, assignment state, and access role.
					</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-3 px-4">
						<Field className="gap-1">
							<FieldLabel>Display name</FieldLabel>
							<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
						</Field>
						<div className="grid gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">Link state</span>
							<Badge tone={profile.userId === null ? 'neutral' : 'info'} variant="outline">
								{profile.userId === null ? 'Historical profile' : 'Linked profile'}
							</Badge>
						</div>
						<RoleField
							editable={membership !== null && canEditRole}
							onChange={setRole}
							value={role}
						/>
						<div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-3 py-2 font-medium text-sm">
							<span>Active</span>
							<Switch checked={isActive} onCheckedChange={setIsActive} />
						</div>
						{error === null ? null : (
							<p className="m-0 text-sm leading-snug text-destructive">{error}</p>
						)}
					</div>
					<SheetFooter>
						<Button type="submit" disabled={isSaving}>
							<SaveIcon aria-hidden="true" />
							Save Changes
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								<CloseIcon data-icon="inline-start" aria-hidden="true" />
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
				<RemoveMemberControl
					auth={auth}
					membership={membership}
					name={profile.displayName}
					onRemoved={() => setOpen(false)}
				/>
			</SheetContent>
		</Sheet>
	);
}

/** The role picker, shown only to somebody who may actually set one. */
function RoleField({
	editable,
	onChange,
	value,
}: {
	readonly editable: boolean;
	readonly onChange: (role: OrgRole) => void;
	readonly value: OrgRole;
}) {
	if (!editable) {
		return null;
	}

	return (
		<Field className="gap-1">
			<FieldLabel>Role</FieldLabel>
			<Select value={value} onValueChange={(next) => onChange(next as OrgRole)}>
				<SelectTrigger size="sm" className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{ORG_ROLE_OPTIONS.map((option) => (
							<SelectItem key={option} value={option}>
								{formatRole(option)}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</Field>
	);
}

/**
 * Ending somebody's access (ADR 0011).
 *
 * Below the form rather than in it: saving a display name and revoking a login
 * are not the same act, and one submit button for both would make the second
 * one an accident waiting to happen.
 *
 * The profile is deliberately left alone. It is what every record this person
 * created still points at, and it goes on being assignable field history — what
 * ends is the login's reach into this agency, not the person.
 */
function RemoveMemberControl({
	auth,
	membership,
	name,
	onRemoved,
}: {
	readonly auth: AuthMe | null;
	readonly membership: MembershipRow | null;
	readonly name: string;
	readonly onRemoved: () => void;
}) {
	if (membership === null || !canRemoveMember(auth, membership)) {
		return null;
	}

	return <RemoveMemberAction membership={membership} name={name} onRemoved={onRemoved} />;
}

function RemoveMemberAction({
	membership,
	name,
	onRemoved,
}: {
	readonly membership: MembershipRow;
	readonly name: string;
	readonly onRemoved: () => void;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);

	async function confirm() {
		setConfirmOpen(false);
		setIsRemoving(true);
		try {
			await removeOrganizationMembership(getServerUrl(), membership.id);
			toast.success(`${name} no longer has access.`);
			onRemoved();
		} catch (removeError) {
			toast.error(errorMessageForSave(removeError));
		} finally {
			setIsRemoving(false);
		}
	}

	return (
		<div className="grid gap-1.5 border-border/50 border-t px-4 pt-3">
			<span className="text-muted-foreground text-xs">
				Removing {name} ends their access to this organization. Their profile and everything
				recorded under it stay.
			</span>
			<div>
				<Button
					disabled={isRemoving}
					onClick={() => setConfirmOpen(true)}
					size="xs"
					type="button"
					variant="destructive"
				>
					<DeleteIcon aria-hidden="true" />
					Remove Access
				</Button>
			</div>
			<AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {name}'s access?</AlertDialogTitle>
						<AlertDialogDescription>
							They will not be able to sign in to this organization. Their profile, and every record
							attributed to it, stay as they are. Reinstating them means a new invitation.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={confirm}>Remove Access</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
