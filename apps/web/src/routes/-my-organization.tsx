import { type OrganizationSettings, resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { OrganizationRow } from '@simmer-mosquito/sync';
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
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { AuthMe } from '../auth';
import { useCollectionRows } from '../sync/useCollectionRows';
import { webCollections } from '../sync/webCollections';

type OrgRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';

const collections = webCollections;
const EditIcon = iconRegistry.actions.edit.icon;
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
	const unitFields = Object.entries(settings.unitDefaults).map(([unitType, code]) =>
		selectField(formatMode(unitType), code, [{ label: code, value: code }]),
	);

	return (
		<div className="grid gap-2.5">
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
					<AgencyDetailsCard
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
					setupItems={setupFor(setup, 'sharedOperations')}
					title="Unit defaults"
				/>

				<DomainSection
					canManage={canManage}
					editDescription="Maintain adult surveillance lookup lists used by trap and collection workflows."
					fields={[]}
					id="adult"
					meta="Trap collection methods, lures, and adult surveillance references"
					setupItems={setupFor(setup, 'adultSurveillance')}
					title="Adult surveillance"
				/>

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
			className="-mx-1 sticky top-[74px] z-[8] bg-[color-mix(in_oklch,var(--app-stage)_92%,transparent)] px-1 pt-1.5 pb-2 backdrop-blur-sm"
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
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (onSave === undefined) {
			setOpen(false);
			return;
		}

		setIsSaving(true);
		setError(null);
		try {
			await onSave(new FormData(event.currentTarget));
			setOpen(false);
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : 'Unable to save changes.');
		} finally {
			setIsSaving(false);
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
						<Button type="submit" disabled={isSaving || onSave === undefined}>
							{isSaving ? 'Saving...' : 'Save changes'}
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline" disabled={isSaving}>
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
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
						<SelectValue />
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

function AgencyDetailsCard({
	organization,
	organizationFallback,
	timezone,
}: {
	readonly organization: OrganizationRow | null;
	readonly organizationFallback: OrganizationFallback;
	readonly timezone: string;
}) {
	const agencyName = organization?.name ?? organizationFallback.name ?? 'Organization details';
	const slug = organization?.slug ?? organizationFallback.slug ?? null;
	const address = formatMailingAddress(organization);

	return (
		<div className="grid gap-3.5 rounded-md border border-border/30 bg-muted/40 p-3.5">
			<div className="flex items-start justify-between gap-3">
				<div className="grid min-w-0 gap-1">
					<span className="text-[0.74rem] leading-tight font-extrabold text-muted-foreground">
						Agency
					</span>
					<strong className="[overflow-wrap:anywhere] text-[1.14rem] leading-tight text-foreground">
						{agencyName}
					</strong>
				</div>
				{slug === null || slug.length === 0 ? null : (
					<Badge tone="neutral" variant="outline">
						{slug}
					</Badge>
				)}
			</div>
			<div className="grid gap-3.5 md:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1.1fr)]">
				<div className="grid min-w-0 content-start gap-2 border-t border-border/50 pt-2.5">
					<span className="text-[0.74rem] leading-tight font-extrabold text-muted-foreground">
						Contact
					</span>
					<AgencyDetailLine label="Email" value={organization?.mainContactEmail} />
					<AgencyDetailLine label="Phone" value={organization?.phoneNumber} />
					<AgencyDetailLine label="Timezone" value={timezone} />
				</div>
				<div className="grid min-w-0 content-start gap-2 border-t border-border/50 pt-2.5">
					<span className="text-[0.74rem] leading-tight font-extrabold text-muted-foreground">
						Mailing address
					</span>
					<p className="m-0 max-w-[56ch] [overflow-wrap:anywhere] text-[0.92rem] leading-normal text-foreground">
						{address}
					</p>
				</div>
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

async function saveAgencyDetails(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	await updateCurrentOrganization(organization, (draft) => {
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

async function saveUnitDefaults(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	await updateCurrentOrganization(organization, (draft) => {
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

async function saveLarvalSettings(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	await updateCurrentOrganization(organization, (draft) => {
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

async function saveControlSettings(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	await updateCurrentOrganization(organization, (draft) => {
		draft.settings = {
			...settings,
			controlOperations: {
				...settings.controlOperations,
				trackInsecticideBatches: requiredFormText(formData, 'Batch tracking') === 'true',
			},
		};
	});
}

async function savePublicSettings(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	await updateCurrentOrganization(organization, (draft) => {
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

async function updateCurrentOrganization(
	organization: OrganizationRow | null,
	applyChanges: (draft: MutableOrganizationRow) => void,
): Promise<void> {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const transaction = collections.currentOrganization.update(organization.id, (draft) => {
		applyChanges(draft as MutableOrganizationRow);
	});
	await transaction.isPersisted.promise;
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
		options: options.some((option) => option.value === value)
			? options
			: [{ label: value, value }, ...options],
	};
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
