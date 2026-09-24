import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { AuthMe } from '../../auth';
import { type PersonListing, usePeopleDirectory } from '../../hooks/queries/use-people-directory';
import { canManageRoles } from '../../lib/write-access';
import { AddIcon } from './constants';
import { EditProfileSheet } from './edit-profile-sheet';
import { formatRole } from './helpers';
import { HistoricalProfileSheet } from './historical-profile-sheet';
import { InviteProfileSheet } from './invite-profile-sheet';
import { OrgSection } from './layout/org-section';
import { OrgSurface } from './layout/org-surface';
import { SectionHeader } from './layout/section-header';
import type { SimmerRole } from './types';

export function PeopleSection({
	auth,
	canManage,
	role,
}: {
	readonly auth: AuthMe | null;
	readonly canManage: boolean;
	readonly role: SimmerRole;
}) {
	const localIdentity = auth?.authenticated === true ? auth.localIdentity : null;
	const user = auth?.authenticated === true ? auth.user : null;
	const {
		activeLinked: activeLinkedRows,
		inactiveLinked: inactiveLinkedRows,
		historical: historicalRows,
	} = usePeopleDirectory();
	const currentPerson =
		activeLinkedRows.find((person) => person.profileId === localIdentity?.profileId) ??
		inactiveLinkedRows.find((person) => person.profileId === localIdentity?.profileId) ??
		historicalRows.find((person) => person.profileId === localIdentity?.profileId);
	const displayName = currentPerson?.displayName ?? user?.displayName ?? 'Current member';
	const email = user?.email ?? null;
	const [isAddingHistorical, setIsAddingHistorical] = useState(false);
	const [isInviting, setIsInviting] = useState(false);
	// Managing people and handing out a role are two floors: an admin onboards,
	// an owner promotes.
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
				{/* The list carries its own measure, 46rem, the width the assignments
				    create form carries. The shell draws the section at the `record`
				    measure (#1045), and a row's name column grows to fill everything
				    up to the actions, so without this the two ends of one row sat
				    about 1400px apart on a 1920 screen (#1054). The invite controls
				    in the header stay at the frame's width. */}
				<div className="grid max-w-[46rem] gap-3">
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
						/>
						<InviteProfileSheet
							auth={auth}
							open={isInviting}
							onOpenChange={setIsInviting}
							people={historicalRows.filter((person) => person.isActive)}
						/>
					</>
				) : null}
			</OrgSurface>
		</OrgSection>
	);
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
	readonly rows: readonly PersonListing[];
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
				<h3 className={eyebrow({ tone: 'primary' })}>{title}</h3>
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
					{rows.map((person) => (
						<ProfileRowItem
							auth={auth}
							canEditRole={canEditRole}
							canManage={canManage}
							key={person.profileId}
							person={person}
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
	person,
}: {
	readonly auth: AuthMe | null;
	readonly canEditRole: boolean;
	readonly canManage: boolean;
	readonly person: PersonListing;
}) {
	return (
		<article className="grid min-w-0 items-start gap-3 rounded-md border border-border/40 bg-card px-3 py-2.5 md:grid-cols-[minmax(220px,1fr)_auto]">
			<div className="grid min-w-0 gap-1">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					{/* A Profile has no detail page of its own, so the name goes where the
					    row action goes. Same absence of gates: every member may read
					    Daily Work, and a deactivated Profile still has records behind it. */}
					<Link
						className={cn(recordLink({ size: 'sm' }), 'w-fit wrap-anywhere leading-snug')}
						params={{ profileId: person.profileId }}
						to="/daily-work/$profileId"
					>
						{person.displayName}
					</Link>
					<Badge tone={person.isActive ? 'success' : 'neutral'} variant="outline">
						{person.isActive ? 'Active' : 'Inactive'}
					</Badge>
					<Badge tone={person.userId === null ? 'neutral' : 'info'} variant="outline">
						{person.userId === null ? 'Historical' : 'Linked'}
					</Badge>
					{person.role === null || person.role === undefined ? null : (
						<Badge
							tone={person.membershipStatus === 'active' ? 'success' : 'neutral'}
							variant="outline"
						>
							{formatRole(person.role)}
						</Badge>
					)}
				</div>
				<p className="m-0 text-sm leading-snug text-muted-foreground">
					{person.email ?? 'No email'}
				</p>
			</div>
			{/* One grid cell, however many actions: the article's second column is
			    where a row's controls go, and a bare sibling would take a row of
			    its own. */}
			<div className="flex items-center gap-2">
				{/* Straight from the roster to this person's day. Not gated on
				    `canManage`, and not on `isActive` either: a deactivated Profile
				    still has a day's worth of records behind it, and Daily Work is an
				    ordinary Organization read that any member may make. */}
				<Button asChild size="sm" variant="outline">
					<Link params={{ profileId: person.profileId }} to="/daily-work/$profileId">
						Daily Work
					</Link>
				</Button>
				{canManage ? (
					<EditProfileSheet auth={auth} canEditRole={canEditRole} person={person} />
				) : null}
			</div>
		</article>
	);
}
