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
	UnitRow,
} from '@simmer-mosquito/sync';
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
import { Tabs, TabsList, TabsTrigger } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AuthMe } from '../auth';
import { useCollectionRows } from '../sync/useCollectionRows';
import { webCollections } from '../sync/webCollections';

type OrgRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';

const collections = webCollections;
const AddIcon = iconRegistry.actions.add.icon;
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
	'AL',
	'AK',
	'AZ',
	'AR',
	'CA',
	'CO',
	'CT',
	'DE',
	'FL',
	'GA',
	'HI',
	'ID',
	'IL',
	'IN',
	'IA',
	'KS',
	'KY',
	'LA',
	'ME',
	'MD',
	'MA',
	'MI',
	'MN',
	'MS',
	'MO',
	'MT',
	'NE',
	'NV',
	'NH',
	'NJ',
	'NM',
	'NY',
	'NC',
	'ND',
	'OH',
	'OK',
	'OR',
	'PA',
	'RI',
	'SC',
	'SD',
	'TN',
	'TX',
	'UT',
	'VT',
	'VA',
	'WA',
	'WV',
	'WI',
	'WY',
	'DC',
] as const;
const US_STATE_SELECT_OPTIONS = US_STATE_OPTIONS.map((state) => ({ label: state, value: state }));

const sections = [
	{ id: 'agency', label: 'Agency' },
	{ id: 'units', label: 'Unit defaults' },
	{ id: 'adult', label: 'Adult' },
	{ id: 'larval', label: 'Larval' },
	{ id: 'control', label: 'Control' },
	{ id: 'public', label: 'Public' },
] as const;

export function MyOrganizationPage({ auth }: { readonly auth: AuthMe | null }) {
	const { rows: organizationRows, status } = useCollectionRows(collections.currentOrganization);
	const { rows: units } = useCollectionRows(collections.units);
	const { rows: collectionMethods } = useCollectionRows(collections.collectionMethods);
	const { rows: collectionLures } = useCollectionRows(collections.collectionLures);
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
							Agency details, workflow defaults, and setup lists stay visible in one place.
						</p>
					</div>
					<PermissionPill role={role} canManage={canManage} />
				</header>

				<OrganizationAnchorTabs />
			</div>

			<div className="grid gap-2">
				<DomainSection
					canManage={canManage}
					editDescription="Update the agency profile details available to organization members."
					fields={agencyFields}
					id="agency"
					meta={status === 'ready' ? 'Current agency details' : 'Agency details loading'}
					onSave={(formData) => saveAgencyDetails(organization, settings, formData)}
					setupItems={[]}
					title={organizationName}
				>
					<AgencyDetailsSummary
						organization={organization}
						organizationFallback={organizationFallback}
						timezone={settings.timezone}
					/>
				</DomainSection>

				<DomainSection
					canManage={canManage}
					editDescription="Set default units used across collection forms, summaries, and operational reports."
					fields={unitFields}
					id="units"
					meta="Measurement choices used across forms and summaries"
					onSave={(formData) => saveUnitDefaults(organization, settings, formData)}
					setupItems={[]}
					title="Unit defaults"
				/>

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
			</div>
		</div>
	);
}

function OrganizationAnchorTabs() {
	const [value, setValue] = useState<SectionId>(() => readHashSection());

	useEffect(() => {
		function updateFromHash() {
			setValue(readHashSection());
		}

		updateFromHash();
		window.addEventListener('hashchange', updateFromHash);
		return () => {
			window.removeEventListener('hashchange', updateFromHash);
		};
	}, []);

	return (
		<Tabs
			value={value}
			onValueChange={(nextValue) => {
				const sectionId = isSectionId(nextValue) ? nextValue : 'agency';
				setValue(sectionId);
				window.location.hash = sectionId;
				document.getElementById(sectionId)?.scrollIntoView({ block: 'start' });
			}}
			className="pt-1.5"
		>
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
					>
						{section.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}

function DomainSection({
	canManage,
	children,
	editDescription,
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
	readonly fields: readonly SettingField[];
	readonly id: SectionId;
	readonly meta: string;
	readonly onSave?: ((formData: FormData) => Promise<void>) | undefined;
	readonly setupItems: readonly SetupCatalog[];
	readonly title: string;
}) {
	return (
		<OrgSection id={id}>
			<OrgSurface>
				<SectionHeader
					action={
						canManage ? (
							<EditSettingsSheet
								description={editDescription}
								fields={fields}
								onSave={onSave}
								title={`Edit ${title}`}
							/>
						) : null
					}
					meta={meta}
					title={title}
				/>
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
			const persistence = onSave(new FormData(event.currentTarget));
			setOpen(false);
			void persistence.catch((saveError) => {
				toast.error(errorMessageForSave(saveError));
			});
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
						{fields.length === 0 ? (
							<p className="m-0 text-[0.86rem] leading-snug text-muted-foreground">
								This domain only has setup lists right now.
							</p>
						) : (
							fields.map((field) => <SettingsEditor field={field} key={field.label} />)
						)}
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
	function createLookup(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		try {
			const transaction = createAdultLookup('collectionMethods', organization, new FormData(form));
			form.reset();
			watchLookupPersistence(transaction, 'Unable to save collection method.');
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
	function createLookup(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		try {
			const transaction = createAdultLookup('collectionLures', organization, new FormData(form));
			form.reset();
			watchLookupPersistence(transaction, 'Unable to save collection lure.');
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

	function updateLookup(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		try {
			const transaction = updateAdultLookup(
				'collectionMethods',
				method,
				new FormData(event.currentTarget),
				isActive,
			);
			watchLookupPersistence(transaction, `Unable to save ${method.name}.`);
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

	function updateLookup(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		try {
			const transaction = updateAdultLookup(
				'collectionLures',
				lure,
				new FormData(event.currentTarget),
				isActive,
			);
			watchLookupPersistence(transaction, `Unable to save ${lure.name}.`);
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

function OrgSection({
	children,
	id,
}: {
	readonly children: React.ReactNode;
	readonly id: SectionId;
}) {
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

function saveAgencyDetails(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	return updateCurrentOrganization(organization, (draft) => {
		draft.name = requiredFormText(formData, 'Organization name');
		draft.mainContactEmail = nullableFormText(formData, 'Main contact');
		draft.phoneNumber = nullableFormText(formData, 'Phone');
		draft.mailingCountry = 'US';
		draft.mailingAddressLine1 = nullableFormText(formData, 'Street address');
		draft.mailingAddressLine2 = nullableFormText(formData, 'Apt, suite, etc.');
		draft.mailingLocality = nullableFormText(formData, 'City');
		draft.mailingRegion = nullableFormText(formData, 'State');
		draft.mailingPostalCode = nullableFormText(formData, 'ZIP code');
		draft.settings = {
			...settings,
			timezone: requiredFormText(formData, 'Timezone'),
		};
	});
}

function saveUnitDefaults(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	return updateCurrentOrganization(organization, (draft) => {
		draft.settings = {
			...settings,
			unitDefaults: Object.fromEntries(
				Object.keys(settings.unitDefaults).map((unitType) => [
					unitType,
					requiredFormText(formData, formatMode(unitType)),
				]),
			) as OrganizationSettings['unitDefaults'],
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

function updateCurrentOrganization(
	organization: OrganizationRow | null,
	applyChanges: (draft: MutableOrganizationRow) => void,
): Promise<void> {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const transaction = collections.currentOrganization.update(organization.id, (draft) => {
		applyChanges(draft as MutableOrganizationRow);
	});
	return transaction.isPersisted.promise.then(() => undefined);
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

function watchLookupPersistence(transaction: PersistenceTransaction, fallback: string): void {
	void transaction.isPersisted.promise.catch((error) => {
		const message = errorMessageForSave(error);
		toast.error(message === 'Unable to save changes.' ? fallback : message);
	});
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

function readHashSection(): SectionId {
	const hash = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '');
	return isSectionId(hash) ? hash : 'agency';
}

function isSectionId(value: string): value is SectionId {
	return sections.some((section) => section.id === value);
}

function formatMode(value: string): string {
	return value
		.split(/[_-]/g)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

type SectionId = (typeof sections)[number]['id'];

type MutableOrganizationRow = {
	-readonly [Key in keyof OrganizationRow]: OrganizationRow[Key];
};

type MutableCollectionMethodRow = {
	-readonly [Key in keyof CollectionMethodRow]: CollectionMethodRow[Key];
};

type MutableCollectionLureRow = {
	-readonly [Key in keyof CollectionLureRow]: CollectionLureRow[Key];
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
