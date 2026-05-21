import {
	type AdultCollectionTimingMode,
	type OrganizationSettings,
	resolveOrganizationSettings,
	type UnitDefaults,
} from '@simmer-mosquito/domain';
import type {
	CollectionLureRow,
	CollectionMethodRow,
	OrganizationRow,
	ProfileRow,
	TagRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { ColorPicker } from '@simmer-mosquito/ui-web/components/color-picker';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Card, CardContent } from '@simmer-mosquito/ui-web/components/ui/card';
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link, useLocation } from '@tanstack/react-router';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { type AuthMe, getServerUrl } from '../auth';
import { useAppForm } from '../forms';
import { inviteOrganizationProfile } from '../sync/profileMutations';
import { useCollectionRows } from '../sync/useCollectionRows';
import { webCollections } from '../sync/webCollections';

type OrgRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';

const collections = webCollections;
const ORG_ROLE_OPTIONS: readonly OrgRole[] = ['viewer', 'collector', 'manager', 'admin', 'owner'];
const AddIcon = iconRegistry.actions.add.icon;
const CloseIcon = iconRegistry.actions.close.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const SaveIcon = iconRegistry.actions.save.icon;
const US_TIMEZONE_OPTIONS = [
	{ label: 'Eastern Time', value: 'America/New_York' },
	{ label: 'Central Time', value: 'America/Chicago' },
	{ label: 'Mountain Time', value: 'America/Denver' },
	{ label: 'Mountain Time (Arizona)', value: 'America/Phoenix' },
	{ label: 'Pacific Time', value: 'America/Los_Angeles' },
	{ label: 'Alaska Time', value: 'America/Anchorage' },
	{ label: 'Hawaii Time', value: 'Pacific/Honolulu' },
] as const;
const US_STATE_OPTIONS = [
	{ code: 'AL', name: 'Alabama' },
	{ code: 'AK', name: 'Alaska' },
	{ code: 'AZ', name: 'Arizona' },
	{ code: 'AR', name: 'Arkansas' },
	{ code: 'CA', name: 'California' },
	{ code: 'CO', name: 'Colorado' },
	{ code: 'CT', name: 'Connecticut' },
	{ code: 'DE', name: 'Delaware' },
	{ code: 'FL', name: 'Florida' },
	{ code: 'GA', name: 'Georgia' },
	{ code: 'HI', name: 'Hawaii' },
	{ code: 'ID', name: 'Idaho' },
	{ code: 'IL', name: 'Illinois' },
	{ code: 'IN', name: 'Indiana' },
	{ code: 'IA', name: 'Iowa' },
	{ code: 'KS', name: 'Kansas' },
	{ code: 'KY', name: 'Kentucky' },
	{ code: 'LA', name: 'Louisiana' },
	{ code: 'ME', name: 'Maine' },
	{ code: 'MD', name: 'Maryland' },
	{ code: 'MA', name: 'Massachusetts' },
	{ code: 'MI', name: 'Michigan' },
	{ code: 'MN', name: 'Minnesota' },
	{ code: 'MS', name: 'Mississippi' },
	{ code: 'MO', name: 'Missouri' },
	{ code: 'MT', name: 'Montana' },
	{ code: 'NE', name: 'Nebraska' },
	{ code: 'NV', name: 'Nevada' },
	{ code: 'NH', name: 'New Hampshire' },
	{ code: 'NJ', name: 'New Jersey' },
	{ code: 'NM', name: 'New Mexico' },
	{ code: 'NY', name: 'New York' },
	{ code: 'NC', name: 'North Carolina' },
	{ code: 'ND', name: 'North Dakota' },
	{ code: 'OH', name: 'Ohio' },
	{ code: 'OK', name: 'Oklahoma' },
	{ code: 'OR', name: 'Oregon' },
	{ code: 'PA', name: 'Pennsylvania' },
	{ code: 'RI', name: 'Rhode Island' },
	{ code: 'SC', name: 'South Carolina' },
	{ code: 'SD', name: 'South Dakota' },
	{ code: 'TN', name: 'Tennessee' },
	{ code: 'TX', name: 'Texas' },
	{ code: 'UT', name: 'Utah' },
	{ code: 'VT', name: 'Vermont' },
	{ code: 'VA', name: 'Virginia' },
	{ code: 'WA', name: 'Washington' },
	{ code: 'WV', name: 'West Virginia' },
	{ code: 'WI', name: 'Wisconsin' },
	{ code: 'WY', name: 'Wyoming' },
	{ code: 'DC', name: 'District of Columbia' },
] as const;
const US_STATE_SELECT_OPTIONS = US_STATE_OPTIONS.map((state) => ({
	label: `${state.code} - ${state.name}`,
	value: state.code,
}));

const sections = [
	{ id: 'general', label: 'General', to: '/my-organization' },
	{ id: 'people', label: 'People', to: '/my-organization/people' },
	{ id: 'adult', label: 'Adult Surveillance', to: '/my-organization/adult-surveillance' },
	{ id: 'larval', label: 'Larval Surveillance', to: '/my-organization/larval-surveillance' },
	{ id: 'control', label: 'Control Methods', to: '/my-organization/control-methods' },
	{ id: 'public', label: 'Public Engagement', to: '/my-organization/public-engagement' },
] as const;

export function MyOrganizationPage({
	auth,
	section,
}: {
	readonly auth: AuthMe | null;
	readonly section: OrganizationSectionId;
}) {
	const { rows: organizationRows, status } = useCollectionRows(collections.currentOrganization);
	const { rows: units } = useCollectionRows(collections.units);
	const { rows: collectionMethods } = useCollectionRows(collections.collectionMethods);
	const { rows: collectionLures } = useCollectionRows(collections.collectionLures);
	const { rows: profiles } = useCollectionRows(collections.profiles);
	const { rows: tags } = useCollectionRows(collections.tags);
	const setup = useSetupCatalogRows();
	const organization = findCurrentOrganization(organizationRows, auth);
	const organizationFallback = readOrganizationFallback(auth);
	const role = readRole(auth);
	const canManage = role === 'owner' || role === 'admin';
	const settings = resolveOrganizationSettings(organization?.settings).settings;
	const organizationName =
		organization?.name ?? organizationFallback.name ?? 'Organization details';

	const agencyFields: readonly SettingField[] = [
		textField('Organization name', organization?.name ?? organizationFallback.name ?? ''),
		textField('Slug', organization?.slug ?? organizationFallback.slug ?? '', { editable: false }),
		textField('Main contact', organization?.mainContactEmail ?? '', { inputType: 'email' }),
		textField('Phone', organization?.phoneNumber ?? '', { inputType: 'tel' }),
		textField('Street address', organization?.mailingAddressLine1 ?? ''),
		textField('Apt, suite, etc.', organization?.mailingAddressLine2 ?? ''),
		textField('City', organization?.mailingLocality ?? ''),
		selectField('State', organization?.mailingRegion ?? '', US_STATE_SELECT_OPTIONS),
		textField('ZIP code', organization?.mailingPostalCode ?? ''),
		selectField('Timezone', settings.timezone, US_TIMEZONE_OPTIONS),
	];
	const unitFields = unitDefaultFields(settings.unitDefaults, units);
	const adultFields: readonly SettingField[] = [
		selectField('Collection timing', settings.adultSurveillance.collectionTimingMode, [
			{ label: 'Exact timestamps', value: 'exact_timestamps' },
			{ label: 'Collection date and duration', value: 'collection_date_duration' },
		]),
	];

	return (
		<div className="mx-auto grid w-full max-w-[1120px] gap-2.5">
			<div className="-mx-1 sticky top-0 z-[8] grid gap-2 bg-[color-mix(in_oklch,var(--app-stage)_94%,transparent)] px-1 pt-0 pb-2 backdrop-blur-sm">
				<header className="flex items-center justify-between gap-4">
					<div className="grid max-w-[68ch] gap-1">
						<p className="eyebrow">Organization workspace</p>
						<h1 className="m-0 text-[1.38rem] leading-tight font-extrabold text-foreground">
							My Organization
						</h1>
						<p className="m-0 text-[0.92rem] leading-snug text-muted-foreground">
							Agency setup is split by workflow so each domain has room for its own decisions.
						</p>
					</div>
					<PermissionPill role={role} canManage={canManage} />
				</header>

				<OrganizationRouteTabs section={section} />
			</div>

			<div className="grid gap-2">
				{section === 'general' ? (
					<GeneralOrganizationSection
						agencyFields={agencyFields}
						canManage={canManage}
						organization={organization}
						organizationFallback={organizationFallback}
						organizationName={organizationName}
						settings={settings}
						status={status}
						tags={tags}
						timezone={settings.timezone}
						unitFields={unitFields}
						units={units}
					/>
				) : null}
				{section === 'people' ? (
					<PeopleSection
						auth={auth}
						canManage={role === 'owner'}
						organization={organization}
						profiles={profiles}
						role={role}
					/>
				) : null}
				{section === 'adult' ? (
					<DomainSection
						canManage={canManage}
						editDescription="Choose how adult collection timing is recorded by this agency."
						fields={adultFields}
						id="adult"
						meta="Trap collection methods, lures, and adult surveillance references"
						onSave={(formData) => saveAdultSettings(organization, settings, formData)}
						setupItems={[]}
						title="Adult surveillance"
					>
						<AdultSurveillanceSettings
							canManage={canManage}
							collectionLures={collectionLures}
							collectionMethods={collectionMethods}
							fields={adultFields}
							organization={organization}
						/>
					</DomainSection>
				) : null}
				{section === 'larval' ? (
					<DomainSection
						canManage={canManage}
						editDescription="Adjust larval inspection entry rules and the setup lists used during habitat inspections."
						fields={[
							selectField('Entry mode', settings.larvalSurveillance.inspectionEntryPolicy.mode, [
								{ label: 'Density only', value: 'density_only' },
								{ label: 'Count and dips required', value: 'count_and_dips_required' },
								{ label: 'Hybrid', value: 'hybrid' },
							]),
							textField(
								'Density inference',
								settings.larvalSurveillance.inspectionEntryPolicy.densityRanges === null
									? 'Not configured'
									: 'Configured',
								{ editable: false },
							),
						]}
						id="larval"
						meta="Inspection entry policy and habitat classification"
						onSave={(formData) => saveLarvalSettings(organization, settings, formData)}
						setupItems={setupFor(setup, 'larvalSurveillance')}
						title="Larval surveillance"
					/>
				) : null}
				{section === 'control' ? (
					<DomainSection
						canManage={canManage}
						editDescription="Adjust control defaults and related operational setup lists."
						fields={[
							switchField('Batch tracking', settings.controlOperations.trackInsecticideBatches),
						]}
						id="control"
						meta="Chemical, source reduction, biological control, and resources"
						onSave={(formData) => saveControlSettings(organization, settings, formData)}
						setupItems={setupFor(setup, 'controlOperations')}
						title="Control operations"
					/>
				) : null}
				{section === 'public' ? (
					<DomainSection
						canManage={canManage}
						editDescription="Set public engagement context defaults and resident communication lookup lists."
						fields={[
							textField(
								'Related-record radius',
								`${settings.publicEngagement.serviceRequestContext.radius.amount}`,
								{ inputType: 'number' },
							),
							textField(
								'Radius unit',
								settings.publicEngagement.serviceRequestContext.radius.unitCode,
							),
							textField(
								'Days before',
								`${settings.publicEngagement.serviceRequestContext.timeWindow.daysBefore}`,
								{ inputType: 'number' },
							),
							textField(
								'Days after',
								`${settings.publicEngagement.serviceRequestContext.timeWindow.daysAfter}`,
								{ inputType: 'number' },
							),
						]}
						id="public"
						meta="Service request context, outreach, and resident notifications"
						onSave={(formData) => savePublicSettings(organization, settings, formData)}
						setupItems={setupFor(setup, 'publicEngagement')}
						title="Public engagement"
					/>
				) : null}
			</div>
		</div>
	);
}

function OrganizationRouteTabs({ section }: { readonly section: OrganizationSectionId }) {
	const { pathname } = useLocation();
	const value = activeOrganizationSectionForPath(pathname, section);

	return (
		<Tabs value={value} className="pt-1.5">
			<TabsList
				variant="line"
				className="w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				aria-label="Organization sections"
			>
				{sections.map((section) => (
					<TabsTrigger
						className="min-w-max flex-none px-1.5 text-[0.82rem] font-bold"
						key={section.id}
						value={section.id}
						asChild
					>
						<Link to={section.to}>{section.label}</Link>
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}

export function activeOrganizationSectionForPath(
	pathname: string,
	fallback: OrganizationSectionId,
): OrganizationSectionId {
	const normalizedPath = pathname === '/my-organization/' ? '/my-organization' : pathname;
	const exactMatch = sections.find((item) => normalizedPath === item.to);
	if (exactMatch !== undefined) {
		return exactMatch.id;
	}

	return (
		sections
			.filter((item) => item.id !== 'general')
			.find((item) => normalizedPath.startsWith(`${item.to}/`))?.id ?? fallback
	);
}

function GeneralOrganizationSection({
	agencyFields,
	canManage,
	organization,
	organizationFallback,
	organizationName,
	settings,
	status,
	tags,
	timezone,
	unitFields,
	units,
}: {
	readonly agencyFields: readonly SettingField[];
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly organizationFallback: OrganizationFallback;
	readonly organizationName: string;
	readonly settings: OrganizationSettings;
	readonly status: string;
	readonly tags: readonly TagRow[];
	readonly timezone: string;
	readonly unitFields: readonly SettingField[];
	readonly units: readonly UnitRow[];
}) {
	const organizationTags =
		organization === null ? tags : tags.filter((tag) => tag.organizationId === organization.id);
	const [isCreatingTag, setIsCreatingTag] = useState(false);

	return (
		<>
			<DomainSection
				canManage={canManage}
				editDescription="Update the agency profile details available to organization members."
				editAction={
					<EditAgencyDetailsSheet
						defaultValues={agencyDetailsFormValues(organization, organizationFallback, settings)}
						description="Update the agency profile details available to organization members."
						organization={organization}
						settings={settings}
						title={`Edit ${organizationName}`}
					/>
				}
				fields={agencyFields}
				id="agency"
				meta={status === 'ready' ? 'Current agency details' : 'Agency details loading'}
				setupItems={[]}
				title={organizationName}
			>
				<AgencyDetailsSummary
					organization={organization}
					organizationFallback={organizationFallback}
					timezone={timezone}
				/>
			</DomainSection>

			<DomainSection
				canManage={canManage}
				editDescription="Set default units used across collection forms, summaries, and operational reports."
				editAction={
					<EditUnitDefaultsSheet
						defaultValues={unitDefaultsFormValues(settings.unitDefaults)}
						description="Set default units used across collection forms, summaries, and operational reports."
						organization={organization}
						settings={settings}
						title="Edit Unit defaults"
						units={units}
					/>
				}
				fields={unitFields}
				id="units"
				meta="Measurement choices used across forms and summaries"
				setupItems={[]}
				title="Unit defaults"
			/>

			<DomainSection
				canManage={canManage}
				editDescription="Manage shared labels, display colors, and tag lifecycle state."
				editAction={
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={organization === null || isCreatingTag}
						onClick={() => setIsCreatingTag(true)}
					>
						<AddIcon aria-hidden="true" />
						Add tag
					</Button>
				}
				fields={[]}
				id="tags"
				meta="Shared record tagging vocabulary"
				setupItems={[]}
				title="Tags"
			>
				<TagSections
					canManage={canManage}
					isCreating={isCreatingTag}
					onCancelCreate={() => setIsCreatingTag(false)}
					organization={organization}
					tags={organizationTags}
				/>
			</DomainSection>
		</>
	);
}

function PeopleSection({
	auth,
	canManage,
	organization,
	profiles,
	role,
}: {
	readonly auth: AuthMe | null;
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly profiles: readonly ProfileRow[];
	readonly role: OrgRole;
}) {
	const localIdentity = auth?.authenticated === true ? auth.localIdentity : null;
	const user = auth?.authenticated === true ? auth.user : null;
	const organizationProfiles =
		localIdentity?.organizationId === null || localIdentity?.organizationId === undefined
			? profiles
			: profiles.filter((profile) => profile.organizationId === localIdentity.organizationId);
	const currentProfile = organizationProfiles.find(
		(profile) => profile.id === localIdentity?.profileId,
	);
	const displayName = currentProfile?.displayName ?? user?.displayName ?? 'Current member';
	const email = user?.email ?? null;
	const [isAddingHistorical, setIsAddingHistorical] = useState(false);
	const [isInviting, setIsInviting] = useState(false);
	const groups = profileGroups(organizationProfiles);

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
									Historical profile
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
							<strong className="[overflow-wrap:anywhere] text-[0.92rem] text-foreground">
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
						profiles={groups.activeLinked}
						title="Active linked profiles"
					/>
					<ProfileGroup
						canManage={canManage}
						emptyLabel="No inactive linked profiles"
						profiles={groups.inactiveLinked}
						title="Inactive linked profiles"
					/>
					<ProfileGroup
						canManage={canManage}
						emptyLabel="No historical profiles"
						profiles={groups.historical}
						title="Historical profiles"
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
							profiles={groups.historical.filter((profile) => profile.isActive)}
						/>
					</>
				) : null}
			</OrgSurface>
		</OrgSection>
	);
}

function ProfileGroup({
	canManage,
	emptyLabel,
	profiles,
	title,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly profiles: readonly ProfileRow[];
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
				<h3 className="eyebrow m-0">{title}</h3>
				<Badge tone="neutral" variant="outline">
					{profiles.length}
				</Badge>
			</div>
			{profiles.length === 0 ? (
				<p className="m-0 rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[0.86rem] text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="grid gap-2">
					{profiles.map((profile) => (
						<ProfileRowItem canManage={canManage} key={profile.id} profile={profile} />
					))}
				</div>
			)}
		</div>
	);
}

function ProfileRowItem({
	canManage,
	profile,
}: {
	readonly canManage: boolean;
	readonly profile: ProfileRow;
}) {
	return (
		<article className="grid min-w-0 items-start gap-3 rounded-md border border-border/40 bg-card px-3 py-2.5 md:grid-cols-[minmax(220px,1fr)_auto]">
			<div className="grid min-w-0 gap-1">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<strong className="[overflow-wrap:anywhere] text-[0.93rem] leading-snug text-foreground">
						{profile.displayName}
					</strong>
					<Badge tone={profile.isActive ? 'success' : 'neutral'} variant="outline">
						{profile.isActive ? 'Active' : 'Inactive'}
					</Badge>
					<Badge tone={profile.userId === null ? 'neutral' : 'info'} variant="outline">
						{profile.userId === null ? 'Historical' : 'Linked'}
					</Badge>
				</div>
				<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">
					{profile.email ?? 'No login link'}
				</p>
			</div>
			{canManage ? <EditProfileSheet profile={profile} /> : null}
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
					<SheetTitle>Add historical profile</SheetTitle>
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
							Save profile
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
					<SheetTitle>Invite linked profile</SheetTitle>
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
							Send invite
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

function EditProfileSheet({ profile }: { readonly profile: ProfileRow }) {
	const [open, setOpen] = useState(false);
	const [displayName, setDisplayName] = useState(profile.displayName);
	const [isActive, setIsActive] = useState(profile.isActive);
	const [error, setError] = useState<string | null>(null);

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setDisplayName(profile.displayName);
			setIsActive(profile.isActive);
			setError(null);
		}
		setOpen(nextOpen);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			const transaction = updateProfile(profile, { displayName, isActive });
			updateOpen(false);
			watchPersistence(transaction, 'Unable to save profile.');
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
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
					<SheetDescription>Update the profile label and whether it is active.</SheetDescription>
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
						<div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-3 py-2 text-[0.88rem] font-bold">
							<span>Active</span>
							<Switch checked={isActive} onCheckedChange={setIsActive} />
						</div>
						{error === null ? null : (
							<p className="m-0 text-[0.84rem] leading-snug text-destructive">{error}</p>
						)}
					</div>
					<SheetFooter>
						<Button type="submit">
							<SaveIcon aria-hidden="true" />
							Save changes
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

function formatRole(role: OrgRole): string {
	return role.charAt(0).toUpperCase() + role.slice(1);
}

function profileGroups(profiles: readonly ProfileRow[]): ProfileGroups {
	const sorted = [...profiles].sort(
		(first, second) =>
			Number(second.isActive) - Number(first.isActive) ||
			first.displayName.localeCompare(second.displayName),
	);

	return {
		activeLinked: sorted.filter((profile) => profile.isActive && profile.userId !== null),
		inactiveLinked: sorted.filter((profile) => !profile.isActive && profile.userId !== null),
		historical: sorted.filter((profile) => profile.userId === null),
	};
}

function TagSections({
	canManage,
	isCreating,
	onCancelCreate,
	organization,
	tags,
}: {
	readonly canManage: boolean;
	readonly isCreating: boolean;
	readonly onCancelCreate: () => void;
	readonly organization: OrganizationRow | null;
	readonly tags: readonly TagRow[];
}) {
	const activeTags = sortedTags(tags.filter((tag) => tag.isActive));
	const deactivatedTags = sortedTags(tags.filter((tag) => !tag.isActive));
	const [editingTagId, setEditingTagId] = useState<string | null>(null);

	return (
		<div className="grid gap-3">
			{canManage && isCreating ? (
				<TagCreatePanel organization={organization} onCancel={onCancelCreate} />
			) : null}
			<TagTableSection
				canManage={canManage}
				editingTagId={editingTagId}
				emptyLabel="No active tags"
				onCancelEdit={() => setEditingTagId(null)}
				onEdit={setEditingTagId}
				title="Active"
				tags={activeTags}
			/>
			<TagTableSection
				canManage={canManage}
				editingTagId={editingTagId}
				emptyLabel="No deactivated tags"
				onCancelEdit={() => setEditingTagId(null)}
				onEdit={setEditingTagId}
				title="Deactivated"
				tags={deactivatedTags}
			/>
		</div>
	);
}

function TagTableSection({
	canManage,
	editingTagId,
	emptyLabel,
	onCancelEdit,
	onEdit,
	tags,
	title,
}: {
	readonly canManage: boolean;
	readonly editingTagId: string | null;
	readonly emptyLabel: string;
	readonly onCancelEdit: () => void;
	readonly onEdit: (tagId: string) => void;
	readonly tags: readonly TagRow[];
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<h3 className="eyebrow mt-0.5 mb-0">{title}</h3>
			{tags.length === 0 ? (
				<p className="m-0 rounded-md border border-border/30 bg-muted/40 px-2.5 py-2 text-[0.86rem] text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 [--tag-actions-column:156px] [--tag-color-column:150px] [--tag-description-column:clamp(220px,30vw,360px)] [--tag-preview-column:clamp(150px,18vw,220px)]">
					<Table className="min-w-[calc(var(--tag-preview-column)+var(--tag-description-column)+var(--tag-color-column)+var(--tag-actions-column))] table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-[var(--tag-preview-column)]">Tag preview</TableHead>
								<TableHead className="w-[var(--tag-description-column)]">Description</TableHead>
								<TableHead className="w-[var(--tag-color-column)]">Color</TableHead>
								{canManage ? (
									<TableHead className="w-[var(--tag-actions-column)] text-right">
										Actions
									</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{tags.map((tag) =>
								editingTagId === tag.id ? (
									<TagEditorTableRow key={tag.id} tag={tag} onCancel={onCancelEdit} />
								) : (
									<TagDisplayTableRow
										canManage={canManage}
										key={tag.id}
										onEdit={() => onEdit(tag.id)}
										tag={tag}
									/>
								),
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

function TagBadge({ tag }: { readonly tag: TagRow }) {
	const color = validHexColor(tag.color);
	const style =
		color === null
			? undefined
			: ({
					'--tag-color': color,
					'--tag-bg': hexWithAlpha(color, 0.14),
					'--tag-border': hexWithAlpha(color, 0.36),
				} as React.CSSProperties);

	return (
		<Badge
			variant={color === null ? 'secondary' : 'outline'}
			className={
				color === null
					? undefined
					: 'border-[var(--tag-border)] bg-[var(--tag-bg)] text-[var(--tag-color)]'
			}
			style={style}
			title={tag.description ?? undefined}
		>
			{tag.tagName}
		</Badge>
	);
}

function TagColorSwatch({ color }: { readonly color: string | null }) {
	const normalized = validHexColor(color);
	const style =
		normalized === null ? undefined : ({ '--tag-color': normalized } as React.CSSProperties);

	return (
		<span className="inline-flex items-center gap-2">
			<span
				aria-hidden="true"
				className={
					normalized === null
						? 'size-3 rounded-sm border border-border bg-muted'
						: 'size-3 rounded-sm border border-border bg-[var(--tag-color)]'
				}
				style={style}
			/>
			<span className="font-mono text-[0.8rem] text-muted-foreground">
				{normalized ?? 'Default'}
			</span>
		</span>
	);
}

function TagDisplayTableRow({
	canManage,
	onEdit,
	tag,
}: {
	readonly canManage: boolean;
	readonly onEdit: () => void;
	readonly tag: TagRow;
}) {
	return (
		<TableRow>
			<TableCell className="w-[var(--tag-preview-column)]">
				<TagBadge tag={tag} />
			</TableCell>
			<TableCell className="w-[var(--tag-description-column)] whitespace-normal text-muted-foreground [overflow-wrap:anywhere]">
				{tag.description ?? 'No description'}
			</TableCell>
			<TableCell className="w-[var(--tag-color-column)]">
				<TagColorSwatch color={tag.color} />
			</TableCell>
			{canManage ? (
				<TableCell className="w-[var(--tag-actions-column)] text-right">
					<Button type="button" variant="outline" size="sm" onClick={onEdit}>
						<EditIcon aria-hidden="true" />
						Edit
					</Button>
				</TableCell>
			) : null}
		</TableRow>
	);
}

function TagCreatePanel({
	onCancel,
	organization,
}: {
	readonly organization: OrganizationRow | null;
	readonly onCancel: () => void;
}) {
	const [values, setValues] = useState<TagFormValues>({
		tagName: '',
		description: '',
		color: '',
		isActive: true,
	});

	function createTag() {
		try {
			const transaction = createOrganizationTagFromValues(organization, values);
			setValues({ tagName: '', description: '', color: '', isActive: true });
			watchPersistence(transaction, 'Unable to create tag.');
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	return (
		<div className="grid gap-2 rounded-md border border-dashed border-border/50 bg-background/50 p-2.5">
			<div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_132px_auto]">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={values.tagName}
						placeholder="New tag"
						onChange={(event) => setValues({ ...values, tagName: event.target.value })}
					/>
				</Field>
				<Field className="gap-1">
					<FieldLabel>Color</FieldLabel>
					<ColorPicker
						value={values.color}
						onChange={(color) => setValues({ ...values, color: color ?? '' })}
					/>
				</Field>
				<div className="flex items-end gap-2">
					<Button type="button" disabled={organization === null} onClick={createTag}>
						<AddIcon aria-hidden="true" />
						Add
					</Button>
					<Button type="button" variant="outline" onClick={onCancel}>
						<CloseIcon aria-hidden="true" />
						Cancel
					</Button>
				</div>
			</div>
			<Field className="gap-1">
				<FieldLabel>Description</FieldLabel>
				<Textarea
					value={values.description}
					className="min-h-14"
					onChange={(event) => setValues({ ...values, description: event.target.value })}
				/>
			</Field>
		</div>
	);
}

function TagEditorTableRow({
	onCancel,
	tag,
}: {
	readonly onCancel: () => void;
	readonly tag: TagRow;
}) {
	const [values, setValues] = useState<TagFormValues>({
		tagName: tag.tagName,
		description: tag.description ?? '',
		color: tag.color ?? '',
		isActive: tag.isActive,
	});

	useEffect(() => {
		setValues({
			tagName: tag.tagName,
			description: tag.description ?? '',
			color: tag.color ?? '',
			isActive: tag.isActive,
		});
	}, [tag]);

	function saveTag() {
		try {
			const transaction = updateOrganizationTagFromValues(tag, values);
			watchPersistence(transaction, `Unable to save ${tag.tagName}.`);
			onCancel();
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	function deleteTag() {
		const transaction = deleteOrganizationTag(tag);
		watchPersistence(transaction, `Unable to delete ${tag.tagName}.`);
		onCancel();
	}

	return (
		<TableRow>
			<TableCell className="w-[var(--tag-preview-column)] align-top">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={values.tagName}
						className="min-w-0"
						onChange={(event) => setValues({ ...values, tagName: event.target.value })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-[var(--tag-description-column)] align-top whitespace-normal">
				<Field className="gap-1">
					<FieldLabel>Description</FieldLabel>
					<Textarea
						value={values.description}
						className="min-h-14 min-w-0 max-w-full resize-y overflow-wrap-anywhere whitespace-pre-wrap"
						onChange={(event) => setValues({ ...values, description: event.target.value })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-[var(--tag-color-column)] align-top">
				<Field className="gap-1">
					<FieldLabel>Color</FieldLabel>
					<ColorPicker
						value={values.color}
						onChange={(color) => setValues({ ...values, color: color ?? '' })}
					/>
				</Field>
				<Field className="mt-2 grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/30 bg-muted/30 px-2.5 py-1">
					<FieldLabel>{values.isActive ? 'Active' : 'Deactivated'}</FieldLabel>
					<Switch
						checked={values.isActive}
						onCheckedChange={(isActive) => setValues({ ...values, isActive })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-[var(--tag-actions-column)] align-top">
				<div className="flex justify-end gap-2">
					<Button type="button" variant="destructive" size="icon" onClick={deleteTag}>
						<DeleteIcon aria-hidden="true" />
						<span className="sr-only">Delete {tag.tagName}</span>
					</Button>
					<Button type="button" variant="outline" size="icon" onClick={saveTag}>
						<SaveIcon aria-hidden="true" />
						<span className="sr-only">Save {tag.tagName}</span>
					</Button>
					<Button type="button" variant="outline" size="icon" onClick={onCancel}>
						<CloseIcon aria-hidden="true" />
						<span className="sr-only">Cancel editing {tag.tagName}</span>
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}

function sortedTags(tags: readonly TagRow[]): TagRow[] {
	return [...tags].sort((first, second) => first.tagName.localeCompare(second.tagName));
}

function validHexColor(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	const normalized = value.trim();
	return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

function hexWithAlpha(hex: string, alpha: number): string {
	const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, '0');
	return `${hex}${alphaHex}`;
}

function DomainSection({
	canManage,
	children,
	editDescription,
	editAction,
	fields,
	id,
	meta,
	onSave,
	setupItems,
	title,
}: {
	readonly canManage: boolean;
	readonly children?: React.ReactNode;
	readonly editDescription: string;
	readonly editAction?: React.ReactNode;
	readonly fields: readonly SettingField[];
	readonly id: string;
	readonly meta: string;
	readonly onSave?: ((formData: FormData) => Promise<void>) | undefined;
	readonly setupItems: readonly SetupCatalog[];
	readonly title: string;
}) {
	const action =
		canManage && editAction !== undefined ? (
			editAction
		) : canManage && fields.length > 0 ? (
			<EditSettingsSheet
				description={editDescription}
				fields={fields}
				onSave={onSave}
				title={`Edit ${title}`}
			/>
		) : null;

	return (
		<OrgSection id={id}>
			<OrgSurface>
				<SectionHeader action={action} meta={meta} title={title} />
				{children ?? (fields.length === 0 ? null : <SettingsDisplayGrid fields={fields} />)}
				<SetupList items={setupItems} />
			</OrgSurface>
		</OrgSection>
	);
}

function EditSettingsSheet({
	description,
	fields,
	onSave,
	title,
}: {
	readonly description: string;
	readonly fields: readonly SettingField[];
	readonly onSave?: ((formData: FormData) => Promise<void>) | undefined;
	readonly title: string;
}) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (onSave === undefined) {
			setOpen(false);
			return;
		}

		setError(null);
		try {
			await onSave(new FormData(event.currentTarget));
			setOpen(false);
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		}
	}

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(440px,100%)]">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-2.5 px-4">
						{fields.map((field) => (
							<SettingsEditor field={field} key={field.label} />
						))}
					</div>
					{error === null ? null : (
						<p className="m-0 px-4 text-[0.84rem] leading-snug text-destructive">{error}</p>
					)}
					<SheetFooter>
						<Button type="submit" disabled={onSave === undefined}>
							Save changes
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function EditAgencyDetailsSheet({
	defaultValues,
	description,
	organization,
	settings,
	title,
}: {
	readonly defaultValues: AgencyDetailsFormValues;
	readonly description: string;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
	readonly title: string;
}) {
	const [open, setOpen] = useState(false);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction = saveAgencyDetailsFromValues(organization, settings, value);
				setOpen(false);
				watchPersistence(transaction, 'Unable to save agency details.');
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
		},
	});

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(440px,100%)]">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				<form.AppForm>
					<form
						className="grid gap-3.5"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid gap-2.5 px-4">
							<form.FormErrorAlert />
							<form.AppField
								name="name"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Organization name is required.' : undefined,
								}}
							>
								{(field) => <field.TextField label="Organization name" />}
							</form.AppField>
							<form.AppField name="mainContactEmail" validators={{ onSubmit: validateEmail }}>
								{(field) => <field.TextField label="Main contact" type="email" />}
							</form.AppField>
							<form.AppField name="phoneNumber">
								{(field) => <field.TextField label="Phone" type="tel" />}
							</form.AppField>
							<form.AppField name="mailingAddressLine1">
								{(field) => <field.TextField label="Street address" />}
							</form.AppField>
							<form.AppField name="mailingAddressLine2">
								{(field) => <field.TextField label="Apt, suite, etc." />}
							</form.AppField>
							<form.AppField name="mailingLocality">
								{(field) => <field.TextField label="City" />}
							</form.AppField>
							<form.AppField name="mailingRegion">
								{(field) => (
									<field.SelectField
										label="State"
										options={US_STATE_SELECT_OPTIONS}
										placeholder="Not set"
									/>
								)}
							</form.AppField>
							<form.AppField name="mailingPostalCode">
								{(field) => <field.TextField label="ZIP code" />}
							</form.AppField>
							<form.AppField
								name="timezone"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Timezone is required.' : undefined,
								}}
							>
								{(field) => <field.SelectField label="Timezone" options={US_TIMEZONE_OPTIONS} />}
							</form.AppField>
						</div>
						<SheetFooter>
							<form.FormActions>
								<form.SubmitButton disabled={organization === null} />
								<SheetClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
										Cancel
									</Button>
								</SheetClose>
							</form.FormActions>
						</SheetFooter>
					</form>
				</form.AppForm>
			</SheetContent>
		</Sheet>
	);
}

function EditUnitDefaultsSheet({
	defaultValues,
	description,
	organization,
	settings,
	title,
	units,
}: {
	readonly defaultValues: UnitDefaultsFormValues;
	readonly description: string;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
	readonly title: string;
	readonly units: readonly UnitRow[];
}) {
	const [open, setOpen] = useState(false);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction = saveUnitDefaultsFromValues(organization, settings, value);
				setOpen(false);
				watchPersistence(transaction, 'Unable to save unit defaults.');
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
		},
	});
	const unitTypes = Object.keys(defaultValues) as Array<keyof UnitDefaultsFormValues>;

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(440px,100%)]">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				<form.AppForm>
					<form
						className="grid gap-3.5"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid gap-2.5 px-4">
							<form.FormErrorAlert />
							{unitTypes.map((unitType) => (
								<form.AppField
									key={unitType}
									name={unitType}
									validators={{
										onSubmit: ({ value }) =>
											value.trim().length === 0
												? `${formatMode(unitType)} is required.`
												: undefined,
									}}
								>
									{(field) => (
										<field.SelectField
											label={formatMode(unitType)}
											options={unitOptionsForDefault(
												defaultValues[unitType],
												units.filter((unit) => unit.unitType === unitType),
											)}
										/>
									)}
								</form.AppField>
							))}
						</div>
						<SheetFooter>
							<form.FormActions>
								<form.SubmitButton disabled={organization === null} />
								<SheetClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
										Cancel
									</Button>
								</SheetClose>
							</form.FormActions>
						</SheetFooter>
					</form>
				</form.AppForm>
			</SheetContent>
		</Sheet>
	);
}

function errorMessageForSave(saveError: unknown): string {
	return saveError instanceof Error ? saveError.message : 'Unable to save changes.';
}

function SettingsDisplayGrid({ fields }: { readonly fields: readonly SettingField[] }) {
	return (
		<div className="grid gap-2 md:grid-cols-4">
			{fields.map((field) => (
				<div
					className="grid min-h-[68px] min-w-0 content-start gap-1.5 rounded-md border border-border/30 bg-muted/40 px-2.5 py-2"
					key={field.label}
				>
					<span className="text-[0.78rem] font-bold text-muted-foreground">{field.label}</span>
					<strong className="[overflow-wrap:anywhere] text-[0.92rem] text-foreground">
						{displayFieldValue(field)}
					</strong>
				</div>
			))}
		</div>
	);
}

function SettingsEditor({ field }: { readonly field: SettingField }) {
	if (field.kind === 'switch') {
		return <SwitchEditor field={field} />;
	}

	if (field.kind === 'select') {
		return (
			<Field className="min-w-0 gap-1">
				<FieldLabel>{field.label}</FieldLabel>
				<Select defaultValue={field.value} disabled={!field.editable} name={field.label}>
					<SelectTrigger size="sm" className="w-full">
						<SelectValue placeholder="Not set" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{field.options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
		);
	}

	return (
		<Field className="min-w-0 gap-1">
			<FieldLabel>{field.label}</FieldLabel>
			<Input
				defaultValue={field.value}
				disabled={!field.editable}
				name={field.label}
				type={field.inputType ?? 'text'}
			/>
		</Field>
	);
}

function SwitchEditor({ field }: { readonly field: SwitchSettingField }) {
	const [checked, setChecked] = useState(field.checked);

	return (
		<Field className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border border-border/30 bg-muted/40 px-2.5 py-0">
			<FieldLabel>{field.label}</FieldLabel>
			<Switch checked={checked} disabled={!field.editable} onCheckedChange={setChecked} />
			<input
				type="hidden"
				name={field.label}
				value={checked ? 'true' : 'false'}
				disabled={!field.editable}
			/>
		</Field>
	);
}

function SetupList({ items }: { readonly items: readonly SetupCatalog[] }) {
	if (items.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1.5">
			<h3 className="eyebrow mt-0.5 mb-0">Setup lists</h3>
			<div className="grid gap-2">
				{items.map((catalog) => (
					<article
						className="grid min-w-0 items-center gap-3 rounded-md border border-border/30 bg-muted/40 p-2.5 md:grid-cols-[minmax(240px,1fr)_auto_96px]"
						key={catalog.label}
					>
						<div className="min-w-0">
							<strong className="[overflow-wrap:anywhere] text-[0.92rem] text-foreground">
								{catalog.label}
							</strong>
							<p className="m-0 text-[0.86rem] leading-snug text-muted-foreground">
								{catalog.detail}
							</p>
						</div>
						<Badge tone={catalog.editable ? 'success' : 'neutral'} variant="outline">
							{catalog.editable ? 'Editable' : 'Read only'}
						</Badge>
						<span className="text-left text-[0.78rem] font-bold text-muted-foreground md:text-right">
							{catalog.count} records
						</span>
					</article>
				))}
			</div>
		</div>
	);
}

function AdultSurveillanceSettings({
	canManage,
	collectionLures,
	collectionMethods,
	fields,
	organization,
}: {
	readonly canManage: boolean;
	readonly collectionLures: readonly CollectionLureRow[];
	readonly collectionMethods: readonly CollectionMethodRow[];
	readonly fields: readonly SettingField[];
	readonly organization: OrganizationRow | null;
}) {
	return (
		<div className="grid gap-3">
			<SettingsDisplayGrid fields={fields} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup lists</h3>
				<div className="grid gap-3">
					<CollectionMethodLookupList
						canManage={canManage}
						organization={organization}
						methods={collectionMethods}
					/>
					<CollectionLureLookupList
						canManage={canManage}
						organization={organization}
						lures={collectionLures}
					/>
				</div>
			</div>
		</div>
	);
}

function CollectionMethodLookupList({
	canManage,
	organization,
	methods,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly methods: readonly CollectionMethodRow[];
}) {
	return (
		<LookupListFrame
			activeCount={methods.filter((method) => method.isActive).length}
			count={methods.length}
			detail="Methods can define optional reporting schema and action thresholds."
			title="Collection methods"
		>
			<CollectionMethodCreateRow canManage={canManage} organization={organization} />
			<LookupRowGroup label="Active methods" rows={methods.filter((method) => method.isActive)}>
				{(method) => (
					<CollectionMethodRowEditor canManage={canManage} key={method.id} method={method} />
				)}
			</LookupRowGroup>
			<LookupRowGroup label="Inactive methods" rows={methods.filter((method) => !method.isActive)}>
				{(method) => (
					<CollectionMethodRowEditor canManage={canManage} key={method.id} method={method} />
				)}
			</LookupRowGroup>
		</LookupListFrame>
	);
}

function CollectionLureLookupList({
	canManage,
	organization,
	lures,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly lures: readonly CollectionLureRow[];
}) {
	return (
		<LookupListFrame
			activeCount={lures.filter((lure) => lure.isActive).length}
			count={lures.length}
			detail="Lures stay as lightweight labels with lifecycle state."
			title="Collection lures"
		>
			<CollectionLureCreateRow canManage={canManage} organization={organization} />
			<LookupRowGroup label="Active lures" rows={lures.filter((lure) => lure.isActive)}>
				{(lure) => <CollectionLureRowEditor canManage={canManage} key={lure.id} lure={lure} />}
			</LookupRowGroup>
			<LookupRowGroup label="Inactive lures" rows={lures.filter((lure) => !lure.isActive)}>
				{(lure) => <CollectionLureRowEditor canManage={canManage} key={lure.id} lure={lure} />}
			</LookupRowGroup>
		</LookupListFrame>
	);
}

function LookupListFrame({
	activeCount,
	children,
	count,
	detail,
	title,
}: {
	readonly activeCount: number;
	readonly children: React.ReactNode;
	readonly count: number;
	readonly detail: string;
	readonly title: string;
}) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="grid min-w-0 gap-1">
					<strong className="[overflow-wrap:anywhere] text-[0.92rem] text-foreground">
						{title}
					</strong>
					<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">{detail}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone="success" variant="outline">
						{activeCount} active
					</Badge>
					<span className="text-[0.78rem] font-bold text-muted-foreground">{count} records</span>
				</div>
			</div>
			<div className="grid gap-2">{children}</div>
		</section>
	);
}

function LookupRowGroup<TRow extends AdultLookupRow>({
	children,
	label,
	rows,
}: {
	readonly children: (row: TRow) => React.ReactNode;
	readonly label: string;
	readonly rows: readonly TRow[];
}) {
	const sortedRows = useMemo(() => sortAdultLookupRows(rows), [rows]);

	return (
		<div className="grid gap-1.5">
			<div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
				<span className="text-[0.76rem] font-bold text-muted-foreground">{label}</span>
				<span className="text-[0.76rem] font-bold text-muted-foreground">{rows.length}</span>
			</div>
			{sortedRows.length === 0 ? (
				<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-[0.84rem] text-muted-foreground">
					No {label.toLowerCase()}.
				</p>
			) : (
				<div className="grid overflow-hidden rounded-md border border-border/30 bg-background/70">
					{sortedRows.map((row) => children(row))}
				</div>
			)}
		</div>
	);
}

function CollectionMethodCreateRow({
	canManage,
	organization,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
}) {
	async function createLookup(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		try {
			const transaction = createAdultLookup('collectionMethods', organization, new FormData(form));
			await transaction.isPersisted.promise;
			form.reset();
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	return (
		<form
			className="grid gap-2 rounded-md border border-dashed border-border/50 bg-background/50 p-2.5"
			onSubmit={createLookup}
		>
			<div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_132px_auto]">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input name="name" placeholder="New method" disabled={!canManage} />
				</Field>
				<Field className="gap-1">
					<FieldLabel>Threshold</FieldLabel>
					<Input name="actionThreshold" type="number" min={0} disabled={!canManage} />
				</Field>
				<Button type="submit" className="self-end" disabled={!canManage}>
					<AddIcon aria-hidden="true" />
					Add
				</Button>
			</div>
			<LookupDetailsGrid>
				<Field className="gap-1">
					<FieldLabel>Description</FieldLabel>
					<Textarea name="description" className="min-h-16" disabled={!canManage} />
				</Field>
				<Field className="gap-1">
					<FieldLabel>Custom schema</FieldLabel>
					<Textarea
						name="customSchema"
						className="min-h-16 font-mono text-[0.78rem]"
						placeholder='{"fields":[]}'
						disabled={!canManage}
					/>
				</Field>
			</LookupDetailsGrid>
		</form>
	);
}

function CollectionLureCreateRow({
	canManage,
	organization,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
}) {
	async function createLookup(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		try {
			const transaction = createAdultLookup('collectionLures', organization, new FormData(form));
			await transaction.isPersisted.promise;
			form.reset();
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	return (
		<form
			className="grid gap-2 rounded-md border border-dashed border-border/50 bg-background/50 p-2.5"
			onSubmit={createLookup}
		>
			<div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_auto]">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input name="name" placeholder="New lure" disabled={!canManage} />
				</Field>
				<Button type="submit" className="self-end" disabled={!canManage}>
					<AddIcon aria-hidden="true" />
					Add
				</Button>
			</div>
			<Field className="gap-1">
				<FieldLabel>Description</FieldLabel>
				<Textarea name="description" className="min-h-14" disabled={!canManage} />
			</Field>
		</form>
	);
}

function CollectionMethodRowEditor({
	canManage,
	method,
}: {
	readonly canManage: boolean;
	readonly method: CollectionMethodRow;
}) {
	const [isActive, setIsActive] = useState(method.isActive);

	useEffect(() => {
		setIsActive(method.isActive);
	}, [method.isActive]);

	async function updateLookup(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		try {
			const transaction = updateAdultLookup(
				'collectionMethods',
				method,
				new FormData(event.currentTarget),
				isActive,
			);
			await transaction.isPersisted.promise;
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	return (
		<form
			className="grid gap-2 border-border/30 p-2.5 [&:not(:last-child)]:border-b"
			onSubmit={updateLookup}
		>
			<div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_132px_auto_auto]">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input defaultValue={method.name} disabled={!canManage} name="name" />
				</Field>
				<Field className="gap-1">
					<FieldLabel>Threshold</FieldLabel>
					<Input
						defaultValue={method.actionThreshold ?? ''}
						disabled={!canManage}
						min={0}
						name="actionThreshold"
						type="number"
					/>
				</Field>
				<Field className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 self-end rounded-md border border-border/30 bg-muted/30 px-2.5 py-1">
					<FieldLabel>Active</FieldLabel>
					<Switch checked={isActive} disabled={!canManage} onCheckedChange={setIsActive} />
				</Field>
				<Button
					type="submit"
					variant="outline"
					size="icon"
					className="self-end"
					disabled={!canManage}
				>
					<SaveIcon aria-hidden="true" />
					<span className="sr-only">Save {method.name}</span>
				</Button>
			</div>
			<LookupDetailsGrid>
				<Field className="gap-1">
					<FieldLabel>Description</FieldLabel>
					<Textarea
						defaultValue={method.description ?? ''}
						disabled={!canManage}
						name="description"
						className="min-h-16"
					/>
				</Field>
				<Field className="gap-1">
					<FieldLabel>Custom schema</FieldLabel>
					<Textarea
						defaultValue={formatCustomSchema(method.customSchema)}
						disabled={!canManage}
						name="customSchema"
						className="min-h-16 font-mono text-[0.78rem]"
					/>
				</Field>
			</LookupDetailsGrid>
		</form>
	);
}

function CollectionLureRowEditor({
	canManage,
	lure,
}: {
	readonly canManage: boolean;
	readonly lure: CollectionLureRow;
}) {
	const [isActive, setIsActive] = useState(lure.isActive);

	useEffect(() => {
		setIsActive(lure.isActive);
	}, [lure.isActive]);

	async function updateLookup(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		try {
			const transaction = updateAdultLookup(
				'collectionLures',
				lure,
				new FormData(event.currentTarget),
				isActive,
			);
			await transaction.isPersisted.promise;
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	return (
		<form
			className="grid gap-2 border-border/30 p-2.5 [&:not(:last-child)]:border-b"
			onSubmit={updateLookup}
		>
			<div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_auto_auto]">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input defaultValue={lure.name} disabled={!canManage} name="name" />
				</Field>
				<Field className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 self-end rounded-md border border-border/30 bg-muted/30 px-2.5 py-1">
					<FieldLabel>Active</FieldLabel>
					<Switch checked={isActive} disabled={!canManage} onCheckedChange={setIsActive} />
				</Field>
				<Button
					type="submit"
					variant="outline"
					size="icon"
					className="self-end"
					disabled={!canManage}
				>
					<SaveIcon aria-hidden="true" />
					<span className="sr-only">Save {lure.name}</span>
				</Button>
			</div>
			<Field className="gap-1">
				<FieldLabel>Description</FieldLabel>
				<Textarea
					defaultValue={lure.description ?? ''}
					disabled={!canManage}
					name="description"
					className="min-h-14"
				/>
			</Field>
		</form>
	);
}

function LookupDetailsGrid({ children }: { readonly children: React.ReactNode }) {
	return <div className="grid gap-2 md:grid-cols-2">{children}</div>;
}

function OrgSection({ children, id }: { readonly children: React.ReactNode; readonly id: string }) {
	return (
		<section className="scroll-mt-[132px]" id={id}>
			{children}
		</section>
	);
}

function OrgSurface({
	children,
	className,
}: {
	readonly children: React.ReactNode;
	readonly className?: string | undefined;
}) {
	return (
		<Card variant="surface" className={className}>
			<CardContent padding="compact" className="grid gap-3">
				{children}
			</CardContent>
		</Card>
	);
}

function SectionHeader({
	action,
	meta,
	title,
}: {
	readonly action?: React.ReactNode;
	readonly meta: string;
	readonly title: string;
}) {
	return (
		<div className="flex items-center justify-between gap-2.5">
			<div>
				<h2 className="m-0 text-[0.98rem] font-extrabold">{title}</h2>
				<p className="mt-0.5 mb-0 text-[0.78rem] leading-snug text-muted-foreground">{meta}</p>
			</div>
			{action === undefined ? null : (
				<div className="[&_a]:text-[0.86rem] [&_a]:font-bold [&_a]:text-primary [&_a]:no-underline">
					{action}
				</div>
			)}
		</div>
	);
}

function PermissionPill({
	canManage,
	role,
}: {
	readonly canManage: boolean;
	readonly role: OrgRole;
}) {
	return (
		<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
			{canManage ? `${formatMode(role)} access` : `${formatMode(role)} view`}
		</Badge>
	);
}

function AgencyDetailsSummary({
	organization,
	organizationFallback,
	timezone,
}: {
	readonly organization: OrganizationRow | null;
	readonly organizationFallback: OrganizationFallback;
	readonly timezone: string;
}) {
	const slug = organization?.slug ?? organizationFallback.slug ?? null;
	const address = formatMailingAddress(organization);

	return (
		<div className="grid gap-3 border-t border-border/50 pt-3 md:grid-cols-[minmax(140px,0.5fr)_minmax(220px,0.9fr)_minmax(260px,1.2fr)]">
			<div className="grid min-w-0 content-start gap-1.5">
				<span className="text-[0.74rem] leading-tight font-extrabold text-muted-foreground">
					Slug
				</span>
				{slug === null || slug.length === 0 ? (
					<strong className="text-[0.92rem] leading-normal text-foreground">Not set</strong>
				) : (
					<Badge tone="neutral" variant="outline" className="w-fit max-w-full">
						<span className="truncate">{slug}</span>
					</Badge>
				)}
			</div>
			<div className="grid min-w-0 content-start gap-2">
				<span className="text-[0.74rem] leading-tight font-extrabold text-muted-foreground">
					Contact
				</span>
				<AgencyDetailLine label="Email" value={organization?.mainContactEmail} />
				<AgencyDetailLine label="Phone" value={organization?.phoneNumber} />
				<AgencyDetailLine label="Timezone" value={timezone} />
			</div>
			<div className="grid min-w-0 content-start gap-2">
				<span className="text-[0.74rem] leading-tight font-extrabold text-muted-foreground">
					Mailing address
				</span>
				<p className="m-0 max-w-[56ch] [overflow-wrap:anywhere] text-[0.92rem] leading-normal text-foreground">
					{address}
				</p>
			</div>
		</div>
	);
}

function AgencyDetailLine({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string | null | undefined;
}) {
	return (
		<p className="m-0 grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2.5">
			<span className="text-[0.8rem] font-bold text-muted-foreground">{label}</span>
			<strong className="[overflow-wrap:anywhere] text-[0.92rem] leading-normal text-foreground">
				{value === undefined || value === null || value.length === 0 ? 'Not set' : value}
			</strong>
		</p>
	);
}

function formatMailingAddress(organization: OrganizationRow | null): string {
	const parts = [
		organization?.mailingAddressLine1,
		organization?.mailingAddressLine2,
		organization?.mailingLocality,
		organization?.mailingRegion,
		organization?.mailingPostalCode,
		organization?.mailingCountry,
	].filter((part): part is string => typeof part === 'string' && part.length > 0);

	return parts.length === 0 ? 'Not set' : parts.join(', ');
}

function agencyDetailsFormValues(
	organization: OrganizationRow | null,
	organizationFallback: OrganizationFallback,
	settings: OrganizationSettings,
): AgencyDetailsFormValues {
	return {
		name: organization?.name ?? organizationFallback.name ?? '',
		mainContactEmail: organization?.mainContactEmail ?? '',
		phoneNumber: organization?.phoneNumber ?? '',
		mailingAddressLine1: organization?.mailingAddressLine1 ?? '',
		mailingAddressLine2: organization?.mailingAddressLine2 ?? '',
		mailingLocality: organization?.mailingLocality ?? '',
		mailingRegion: organization?.mailingRegion ?? '',
		mailingPostalCode: organization?.mailingPostalCode ?? '',
		timezone: settings.timezone,
	};
}

function saveAgencyDetailsFromValues(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	values: AgencyDetailsFormValues,
): PersistenceTransaction {
	return updateCurrentOrganizationOptimistically(organization, (draft) => {
		draft.name = requiredTextValue(values.name, 'Organization name');
		draft.mainContactEmail = nullableTextValue(values.mainContactEmail);
		draft.phoneNumber = nullableTextValue(values.phoneNumber);
		draft.mailingCountry = 'US';
		draft.mailingAddressLine1 = nullableTextValue(values.mailingAddressLine1);
		draft.mailingAddressLine2 = nullableTextValue(values.mailingAddressLine2);
		draft.mailingLocality = nullableTextValue(values.mailingLocality);
		draft.mailingRegion = nullableTextValue(values.mailingRegion);
		draft.mailingPostalCode = nullableTextValue(values.mailingPostalCode);
		draft.settings = {
			...settings,
			timezone: requiredTextValue(values.timezone, 'Timezone'),
		};
	});
}

function unitDefaultsFormValues(unitDefaults: UnitDefaults): UnitDefaultsFormValues {
	return { ...unitDefaults };
}

function saveUnitDefaultsFromValues(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	values: UnitDefaultsFormValues,
): PersistenceTransaction {
	return updateCurrentOrganizationOptimistically(organization, (draft) => {
		draft.settings = {
			...settings,
			unitDefaults: Object.fromEntries(
				Object.entries(values).map(([unitType, unitCode]) => [
					unitType,
					requiredTextValue(unitCode, formatMode(unitType)),
				]),
			) as UnitDefaults,
		};
	});
}

function saveAdultSettings(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	return updateCurrentOrganization(organization, (draft) => {
		draft.settings = {
			...settings,
			adultSurveillance: {
				...settings.adultSurveillance,
				collectionTimingMode: requiredFormText(
					formData,
					'Collection timing',
				) as AdultCollectionTimingMode,
			},
		};
	});
}

function saveLarvalSettings(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	return updateCurrentOrganization(organization, (draft) => {
		draft.settings = {
			...settings,
			larvalSurveillance: {
				...settings.larvalSurveillance,
				inspectionEntryPolicy: {
					...settings.larvalSurveillance.inspectionEntryPolicy,
					mode: requiredFormText(formData, 'Entry mode') as never,
				},
			},
		};
	});
}

function saveControlSettings(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	return updateCurrentOrganization(organization, (draft) => {
		draft.settings = {
			...settings,
			controlOperations: {
				...settings.controlOperations,
				trackInsecticideBatches: requiredFormText(formData, 'Batch tracking') === 'true',
			},
		};
	});
}

function savePublicSettings(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	return updateCurrentOrganization(organization, (draft) => {
		draft.settings = {
			...settings,
			publicEngagement: {
				...settings.publicEngagement,
				serviceRequestContext: {
					...settings.publicEngagement.serviceRequestContext,
					radius: {
						amount: requiredFormNumber(formData, 'Related-record radius'),
						unitCode: requiredFormText(formData, 'Radius unit'),
					},
					timeWindow: {
						daysBefore: requiredFormNumber(formData, 'Days before'),
						daysAfter: requiredFormNumber(formData, 'Days after'),
					},
				},
			},
		};
	});
}

function createOrganizationTag(
	organization: OrganizationRow | null,
	formData: FormData,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.tags.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		tagName: requiredFormText(formData, 'tagName'),
		description: nullableFormText(formData, 'description'),
		color: nullableFormHexColor(formData, 'color'),
		isActive: true,
		createdAt: now,
		updatedAt: now,
	});
}

function createOrganizationTagFromValues(
	organization: OrganizationRow | null,
	values: TagFormValues,
): PersistenceTransaction {
	return createOrganizationTag(organization, tagFormData(values));
}

function createHistoricalProfile(
	organization: OrganizationRow | null,
	values: ProfileFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.profiles.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		userId: null,
		displayName: requiredTextValue(values.displayName, 'Display name'),
		email: null,
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

function updateProfile(profile: ProfileRow, values: ProfileFormValues): PersistenceTransaction {
	return collections.profiles.update(profile.id, (draft) => {
		const mutable = draft as MutableProfileRow;
		mutable.displayName = requiredTextValue(values.displayName, 'Display name');
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

function updateOrganizationTag(
	tag: TagRow,
	formData: FormData,
	isActive: boolean,
): PersistenceTransaction {
	return collections.tags.update(tag.id, (draft) => {
		const mutable = draft as MutableTagRow;
		mutable.tagName = requiredFormText(formData, 'tagName');
		mutable.description = nullableFormText(formData, 'description');
		mutable.color = nullableFormHexColor(formData, 'color');
		mutable.isActive = isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

function updateOrganizationTagFromValues(
	tag: TagRow,
	values: TagFormValues,
): PersistenceTransaction {
	return updateOrganizationTag(tag, tagFormData(values), values.isActive);
}

function deleteOrganizationTag(tag: TagRow): PersistenceTransaction {
	return collections.tags.delete(tag.id);
}

function tagFormData(values: TagFormValues): FormData {
	const formData = new FormData();
	formData.set('tagName', values.tagName);
	formData.set('description', values.description);
	formData.set('color', values.color);
	return formData;
}

function updateCurrentOrganization(
	organization: OrganizationRow | null,
	applyChanges: (draft: MutableOrganizationRow) => void,
): Promise<void> {
	return updateCurrentOrganizationOptimistically(
		organization,
		applyChanges,
	).isPersisted.promise.then(() => undefined);
}

function updateCurrentOrganizationOptimistically(
	organization: OrganizationRow | null,
	applyChanges: (draft: MutableOrganizationRow) => void,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	return collections.currentOrganization.update(organization.id, (draft) => {
		applyChanges(draft as MutableOrganizationRow);
	});
}

function watchPersistence(transaction: PersistenceTransaction, fallback: string): void {
	void transaction.isPersisted.promise.catch((error) => {
		const message = errorMessageForSave(error);
		toast.error(message === 'Unable to save changes.' ? fallback : message);
	});
}

function requiredFormText(formData: FormData, name: string): string {
	const value = formData.get(name);
	const text = typeof value === 'string' ? value.trim() : '';
	if (text.length === 0) {
		throw new Error(`${name} is required.`);
	}
	return text;
}

function nullableFormText(formData: FormData, name: string): string | null {
	const value = formData.get(name);
	const text = typeof value === 'string' ? value.trim() : '';
	return text.length === 0 ? null : text;
}

function nullableFormHexColor(formData: FormData, name: string): string | null {
	const text = nullableFormText(formData, name);
	if (text === null) {
		return null;
	}

	const normalized = text.startsWith('#') ? text : `#${text}`;
	if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
		throw new Error(`${name} must be a hex color like #2563EB.`);
	}

	return normalized.toUpperCase();
}

function requiredTextValue(value: string, label: string): string {
	const text = value.trim();
	if (text.length === 0) {
		throw new Error(`${label} is required.`);
	}
	return text;
}

function nullableTextValue(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}

function validateEmail({ value }: { readonly value: string }): string | undefined {
	const text = value.trim();
	if (text.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
		return undefined;
	}

	return 'Main contact must be a valid email address.';
}

function requiredFormNumber(formData: FormData, name: string): number {
	const value = Number(requiredFormText(formData, name));
	if (!Number.isFinite(value)) {
		throw new Error(`${name} must be a number.`);
	}
	return value;
}

function createAdultLookup(
	kind: AdultLookupKind,
	organization: OrganizationRow | null,
	formData: FormData,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	const base = {
		id: crypto.randomUUID(),
		organizationId: organization.id,
		name: requiredFormText(formData, 'name'),
		description: nullableFormText(formData, 'description'),
		isActive: true,
		createdAt: now,
		updatedAt: now,
	};

	if (kind === 'collectionMethods') {
		return collections.collectionMethods.insert({
			...base,
			customSchema: customSchemaFormJson(formData),
			actionThreshold: nullableFormNonnegativeInteger(formData, 'actionThreshold'),
		});
	}

	return collections.collectionLures.insert(base);
}

function updateAdultLookup(
	kind: AdultLookupKind,
	row: AdultLookupRow,
	formData: FormData,
	isActive: boolean,
): PersistenceTransaction {
	if (kind === 'collectionMethods') {
		return collections.collectionMethods.update(row.id, (draft) => {
			const mutable = draft as MutableCollectionMethodRow;
			mutable.name = requiredFormText(formData, 'name');
			mutable.description = nullableFormText(formData, 'description');
			mutable.customSchema = customSchemaFormJson(formData);
			mutable.actionThreshold = nullableFormNonnegativeInteger(formData, 'actionThreshold');
			mutable.isActive = isActive;
		});
	}

	return collections.collectionLures.update(row.id, (draft) => {
		const mutable = draft as MutableCollectionLureRow;
		mutable.name = requiredFormText(formData, 'name');
		mutable.description = nullableFormText(formData, 'description');
		mutable.isActive = isActive;
	});
}

function customSchemaFormJson(formData: FormData): Record<string, unknown> | null {
	const text = nullableFormText(formData, 'customSchema');
	if (text === null) {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('Custom schema must be valid JSON.');
	}

	if (!isPlainJsonObject(parsed)) {
		throw new Error('Custom schema must be a JSON object.');
	}

	return parsed;
}

function nullableFormNonnegativeInteger(formData: FormData, name: string): number | null {
	const text = nullableFormText(formData, name);
	if (text === null) {
		return null;
	}

	const value = Number(text);
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${name} must be a nonnegative whole number.`);
	}
	return value;
}

function formatCustomSchema(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	return JSON.stringify(value, null, 2);
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function useSetupCatalogRows(): SetupCatalog[] {
	const { rows: units } = useCollectionRows(collections.units);
	const { rows: collectionMethods } = useCollectionRows(collections.collectionMethods);
	const { rows: collectionLures } = useCollectionRows(collections.collectionLures);
	const { rows: habitatTypes } = useCollectionRows(collections.habitatTypes);
	const { rows: organizationSpecies } = useCollectionRows(collections.organizationSpecies);
	const { rows: applicationMethods } = useCollectionRows(collections.applicationMethods);
	const { rows: sourceReductionMethods } = useCollectionRows(collections.sourceReductionMethods);
	const { rows: outreachMethods } = useCollectionRows(collections.outreachMethods);
	const { rows: biocontrolMethods } = useCollectionRows(collections.biocontrolMethods);
	const { rows: vehicles } = useCollectionRows(collections.vehicles);
	const { rows: equipment } = useCollectionRows(collections.equipment);
	const { rows: notificationTypes } = useCollectionRows(collections.notificationTypes);
	const { rows: tags } = useCollectionRows(collections.tags);
	const { rows: routes } = useCollectionRows(collections.routes);

	return useMemo(
		() => [
			catalog(
				'adultSurveillance',
				'Collection methods',
				collectionMethods.length,
				true,
				'Adult surveillance collection choices',
			),
			catalog(
				'adultSurveillance',
				'Collection lures',
				collectionLures.length,
				true,
				'Trap lure labels and lifecycle',
			),
			catalog(
				'larvalSurveillance',
				'Habitat types',
				habitatTypes.length,
				true,
				'Larval habitat classification',
			),
			catalog(
				'controlOperations',
				'Application methods',
				applicationMethods.length,
				false,
				'Chemical control method setup',
			),
			catalog(
				'controlOperations',
				'Source reduction methods',
				sourceReductionMethods.length,
				false,
				'Physical reduction method setup',
			),
			catalog(
				'publicEngagement',
				'Outreach methods',
				outreachMethods.length,
				false,
				'Public outreach action setup',
			),
			catalog(
				'controlOperations',
				'Biocontrol methods',
				biocontrolMethods.length,
				false,
				'Biological control method setup',
			),
			catalog(
				'controlOperations',
				'Vehicles',
				vehicles.length,
				false,
				'Fleet resources for assignments',
			),
			catalog(
				'controlOperations',
				'Equipment',
				equipment.length,
				false,
				'Equipment available to operations',
			),
			catalog(
				'publicEngagement',
				'Notification types',
				notificationTypes.length,
				false,
				'Public engagement notification labels',
			),
			catalog(
				'sharedOperations',
				'Measurement units',
				units.length,
				false,
				'Unit options available to forms and summaries',
			),
			catalog(
				'sharedOperations',
				'Enabled species',
				organizationSpecies.length,
				false,
				'Species taxonomy enabled for this agency',
			),
			catalog('sharedOperations', 'Tags', tags.length, false, 'Shared record tagging vocabulary'),
			catalog(
				'sharedOperations',
				'Routes',
				routes.length,
				false,
				'Habitat and trap route definitions',
			),
		],
		[
			applicationMethods.length,
			biocontrolMethods.length,
			collectionLures.length,
			collectionMethods.length,
			equipment.length,
			habitatTypes.length,
			notificationTypes.length,
			organizationSpecies.length,
			outreachMethods.length,
			routes.length,
			sourceReductionMethods.length,
			tags.length,
			units.length,
			vehicles.length,
		],
	);
}

function catalog(
	domain: SetupDomain,
	label: string,
	count: number,
	editable: boolean,
	detail: string,
): SetupCatalog {
	return { domain, label, count, editable, detail };
}

function setupFor(setup: readonly SetupCatalog[], domain: SetupDomain): SetupCatalog[] {
	return setup.filter((item) => item.domain === domain);
}

function sortAdultLookupRows<TRow extends AdultLookupRow>(rows: readonly TRow[]): TRow[] {
	return [...rows].sort(
		(first, second) =>
			Number(second.isActive) - Number(first.isActive) || first.name.localeCompare(second.name),
	);
}

function textField(
	label: string,
	value: string,
	options: {
		readonly editable?: boolean;
		readonly inputType?: React.HTMLInputTypeAttribute;
	} = {},
): TextSettingField {
	return {
		kind: 'text',
		label,
		value,
		editable: options.editable ?? true,
		inputType: options.inputType,
	};
}

function selectField(
	label: string,
	value: string,
	options: readonly SelectOption[],
): SelectSettingField {
	return {
		kind: 'select',
		label,
		value,
		editable: true,
		options: selectOptionsForValue(value, options),
	};
}

export function unitDefaultFields(
	unitDefaults: UnitDefaults,
	units: readonly UnitRow[],
): readonly SelectSettingField[] {
	return (Object.entries(unitDefaults) as Array<[keyof UnitDefaults, string]>).map(
		([unitType, code]) =>
			selectField(
				formatMode(unitType),
				code,
				unitOptionsForDefault(
					code,
					units.filter((unit) => unit.unitType === unitType),
				),
			),
	);
}

function unitOptionsForDefault(code: string, units: readonly UnitRow[]): readonly SelectOption[] {
	return [...units]
		.sort((first, second) => compareUnitsForSelect(code, first, second))
		.map(unitOption);
}

function compareUnitsForSelect(code: string, first: UnitRow, second: UnitRow): number {
	if (first.code === code || second.code === code) {
		return first.code === code ? -1 : 1;
	}

	return (
		first.unitSystem.localeCompare(second.unitSystem) ||
		first.unitName.localeCompare(second.unitName) ||
		first.code.localeCompare(second.code)
	);
}

function unitOption(unit: UnitRow): SelectOption {
	return {
		label:
			unit.abbreviation.length === 0 ? unit.unitName : `${unit.unitName} (${unit.abbreviation})`,
		value: unit.code,
	};
}

export function selectOptionsForValue(
	value: string,
	options: readonly SelectOption[],
): readonly SelectOption[] {
	if (value.length === 0 || options.some((option) => option.value === value)) {
		return options;
	}

	return [{ label: value, value }, ...options];
}

function switchField(label: string, checked: boolean): SwitchSettingField {
	return { kind: 'switch', label, checked, editable: true };
}

function displayFieldValue(field: SettingField): string {
	if (field.kind === 'switch') {
		return field.checked ? 'Enabled' : 'Disabled';
	}

	if (field.kind === 'select') {
		return field.options.find((option) => option.value === field.value)?.label ?? field.value;
	}

	return field.value.length === 0 ? 'Not set' : field.value;
}

function findCurrentOrganization(
	organizations: readonly OrganizationRow[],
	auth: AuthMe | null,
): OrganizationRow | null {
	const organizationId = auth?.authenticated === true ? auth.localIdentity.organizationId : null;
	return (
		organizations.find((organization) => organization.id === organizationId) ??
		organizations[0] ??
		null
	);
}

function readOrganizationFallback(auth: AuthMe | null): OrganizationFallback {
	if (auth?.authenticated !== true) {
		return {};
	}

	return {
		...(auth.localIdentity.organizationName === undefined
			? {}
			: { name: auth.localIdentity.organizationName }),
		...(auth.localIdentity.organizationSlug === undefined
			? {}
			: { slug: auth.localIdentity.organizationSlug }),
	};
}

function readRole(auth: AuthMe | null): OrgRole {
	if (auth?.authenticated !== true) {
		return 'viewer';
	}
	const role = auth.localIdentity.role;
	return role === 'owner' ||
		role === 'admin' ||
		role === 'manager' ||
		role === 'collector' ||
		role === 'viewer'
		? role
		: 'viewer';
}

function formatMode(value: string): string {
	return value
		.split(/[_-]/g)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

export type OrganizationSectionId = (typeof sections)[number]['id'];

type MutableOrganizationRow = {
	-readonly [Key in keyof OrganizationRow]: OrganizationRow[Key];
};

type MutableCollectionMethodRow = {
	-readonly [Key in keyof CollectionMethodRow]: CollectionMethodRow[Key];
};

type MutableCollectionLureRow = {
	-readonly [Key in keyof CollectionLureRow]: CollectionLureRow[Key];
};

type MutableProfileRow = {
	-readonly [Key in keyof ProfileRow]: ProfileRow[Key];
};

type MutableTagRow = {
	-readonly [Key in keyof TagRow]: TagRow[Key];
};

type AdultLookupKind = 'collectionMethods' | 'collectionLures';
type AdultLookupRow = CollectionMethodRow | CollectionLureRow;

interface PersistenceTransaction {
	readonly isPersisted: {
		readonly promise: Promise<unknown>;
	};
}

interface SetupCatalog {
	readonly domain: SetupDomain;
	readonly label: string;
	readonly count: number;
	readonly editable: boolean;
	readonly detail: string;
}

interface OrganizationFallback {
	readonly name?: string;
	readonly slug?: string | null;
}

interface AgencyDetailsFormValues {
	readonly name: string;
	readonly mainContactEmail: string;
	readonly phoneNumber: string;
	readonly mailingAddressLine1: string;
	readonly mailingAddressLine2: string;
	readonly mailingLocality: string;
	readonly mailingRegion: string;
	readonly mailingPostalCode: string;
	readonly timezone: string;
}

interface TagFormValues {
	readonly tagName: string;
	readonly description: string;
	readonly color: string;
	readonly isActive: boolean;
}

interface ProfileFormValues {
	readonly displayName: string;
	readonly isActive: boolean;
}

interface ProfileGroups {
	readonly activeLinked: readonly ProfileRow[];
	readonly inactiveLinked: readonly ProfileRow[];
	readonly historical: readonly ProfileRow[];
}

type UnitDefaultsFormValues = UnitDefaults;

type SetupDomain =
	| 'adultSurveillance'
	| 'larvalSurveillance'
	| 'controlOperations'
	| 'publicEngagement'
	| 'sharedOperations';

type SettingField = TextSettingField | SelectSettingField | SwitchSettingField;

interface TextSettingField {
	readonly kind: 'text';
	readonly label: string;
	readonly value: string;
	readonly editable: boolean;
	readonly inputType?: React.HTMLInputTypeAttribute | undefined;
}

interface SelectSettingField {
	readonly kind: 'select';
	readonly label: string;
	readonly value: string;
	readonly editable: boolean;
	readonly options: readonly SelectOption[];
}

interface SwitchSettingField {
	readonly kind: 'switch';
	readonly label: string;
	readonly checked: boolean;
	readonly editable: boolean;
}

interface SelectOption {
	readonly label: string;
	readonly value: string;
}
