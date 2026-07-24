import type { MembershipRow, OrganizationRow, ProfileRow } from '@simmer-mosquito/sync';
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
import { useState } from 'react';
import { toast } from 'sonner';
import { type AuthMe, getServerUrl } from '../../../auth';
import {
	inviteOrganizationProfile,
	updateOrganizationMembershipRole,
} from '../../../sync/profileMutations';
import { AddIcon, CloseIcon, EditIcon, ORG_ROLE_OPTIONS, SaveIcon } from './constants';
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
	readonly organization: OrganizationRow | null;
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
									disabled={organization === null}
									onClick={() => setIsAddingHistorical(true)}
								>
									<AddIcon aria-hidden="true" />
									Historical Profile
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={organization === null}
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
							<strong className="wrap-anywhere text-[0.92rem] text-foreground">
								{displayName}
							</strong>
							<p className="m-0 text-[0.86rem] leading-snug text-muted-foreground">
								{email ?? 'No email available'}
							</p>
						</div>
						<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
							{formatRole(role)}
						</Badge>
					</article>
					<ProfileGroup
						canManage={canManage}
						emptyLabel="No active linked profiles"
						rows={activeLinkedRows}
						title="Active Linked Profiles"
					/>
					<ProfileGroup
						canManage={canManage}
						emptyLabel="No inactive linked profiles"
						rows={inactiveLinkedRows}
						title="Inactive Linked Profiles"
					/>
					<ProfileGroup
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

export function ProfileGroup({
	canManage,
	emptyLabel,
	rows,
	title,
}: {
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
				<p className="m-0 rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[0.86rem] text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="grid gap-2">
					{rows.map(({ membership, profile }) => (
						<ProfileRowItem
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

export function ProfileRowItem({
	canManage,
	membership,
	profile,
}: {
	readonly canManage: boolean;
	readonly membership: MembershipRow | null;
	readonly profile: ProfileRow;
}) {
	return (
		<article className="grid min-w-0 items-start gap-3 rounded-md border border-border/40 bg-card px-3 py-2.5 md:grid-cols-[minmax(220px,1fr)_auto]">
			<div className="grid min-w-0 gap-1">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<strong className="wrap-anywhere text-[0.93rem] leading-snug text-foreground">
						{profile.displayName}
					</strong>
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
				<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">
					{profile.email ?? 'No login link'}
				</p>
			</div>
			{canManage ? <EditProfileSheet membership={membership} profile={profile} /> : null}
		</article>
	);
}

export function HistoricalProfileSheet({
	onOpenChange,
	open,
	organization,
}: {
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
	readonly organization: OrganizationRow | null;
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
						<div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-3 py-2 text-[0.88rem] font-bold">
							<span>Active for assignment</span>
							<Switch checked={isActive} onCheckedChange={setIsActive} />
						</div>
						{error === null ? null : (
							<p className="m-0 text-[0.84rem] leading-snug text-destructive">{error}</p>
						)}
					</div>
					<SheetFooter>
						<Button type="submit" disabled={organization === null}>
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

export function InviteProfileSheet({
	onOpenChange,
	open,
	profiles,
}: {
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
	readonly profiles: readonly ProfileRow[];
}) {
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
									{ORG_ROLE_OPTIONS.map((option) => (
										<SelectItem key={option} value={option}>
											{formatRole(option)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						{error === null ? null : (
							<p className="m-0 text-[0.84rem] leading-snug text-destructive">{error}</p>
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

export function EditProfileSheet({
	membership,
	profile,
}: {
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
							<span className="text-[0.78rem] font-bold text-muted-foreground">Link state</span>
							<Badge tone={profile.userId === null ? 'neutral' : 'info'} variant="outline">
								{profile.userId === null ? 'Historical profile' : 'Linked profile'}
							</Badge>
						</div>
						{membership === null ? null : (
							<Field className="gap-1">
								<FieldLabel>Role</FieldLabel>
								<Select value={role} onValueChange={(value) => setRole(value as OrgRole)}>
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
						)}
						<div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-3 py-2 text-[0.88rem] font-bold">
							<span>Active</span>
							<Switch checked={isActive} onCheckedChange={setIsActive} />
						</div>
						{error === null ? null : (
							<p className="m-0 text-[0.84rem] leading-snug text-destructive">{error}</p>
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
			</SheetContent>
		</Sheet>
	);
}
