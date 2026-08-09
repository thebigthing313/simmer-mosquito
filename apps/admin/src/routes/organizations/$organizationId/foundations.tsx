import type { GeoJsonGeometry, GeoJsonPoint, ImportGeometryKind } from '@simmer-mosquito/mapping';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { AdminError, AdminLoading, AdminPage } from '../../../components/admin-page';
import { AgencySessionGate } from '../../../components/agency-session';
import { CatalogList, CatalogRow, RecordDialog } from '../../../components/catalog';
import { GeometryFileInput, PointInput } from '../../../components/geometry-input';
import { useAgencies } from '../-agency-data';
import {
	type AgencyFoundations,
	type LookupKind,
	useAgencyFoundations,
	useCreateFoundation,
} from './-foundations-data';

const FoundationsIcon = iconRegistry.generic.settings.icon;
const RegionIcon = iconRegistry.entities.region.icon;
const AddressIcon = iconRegistry.actions.pin.icon;
const TrapIcon = iconRegistry.entities.trap.icon;
const AddIcon = iconRegistry.actions.add.icon;
const CheckIcon = iconRegistry.actions.check.icon;

/** Stable reference — a literal here would be a new array on every render. */
const POLYGON_ONLY: readonly ImportGeometryKind[] = ['Polygon'];

export const Route = createFileRoute('/organizations/$organizationId/foundations')({
	component: AgencyFoundationsRoute,
});

/**
 * The agency-bootstrap page.
 *
 * Everything here is **create-only**, because that is all the server offers on
 * these seven endpoints. That is a deliberate shape rather than an omission: an
 * operator's job is to get a new agency to the point where its own people can
 * work, and from then on the agency maintains its catalogs in the web app, where
 * editing and deleting exist. The copy says so rather than leaving an operator
 * hunting for an edit control that was never built.
 *
 * The layout is a **sequence, not a grid**. These eight things are not eight
 * peers to compare — they have a dependency order (a trap needs a collection
 * method; a region can want a folder) and a natural grouping, and the operator's
 * real question on arrival is "what is still missing before this agency can
 * work?". Eight equal cards answer that question worst of all: every one looks
 * as urgent as every other, and the order they happen to sit in is the order
 * they were written. So the page opens with what is outstanding and then reads
 * top to bottom in the order the work actually happens.
 *
 * The two shapes are also deliberately different. Vocabulary and species are
 * bare names — they scan far better as wrapped chips than as a column of rows
 * with an empty subtitle each. Regions, addresses, and traps carry a second
 * line worth reading, so those stay as rows.
 */
function AgencyFoundationsRoute() {
	const { organizationId } = Route.useParams();
	// The directory's cache, already warm from the list the operator arrived
	// through. Read here for the WorkOS organization id the session switch needs.
	const { data: agencies } = useAgencies();
	const agency = (agencies ?? []).find((row) => row.id === organizationId);
	const { data, isPending, error } = useAgencyFoundations(organizationId);
	const create = useCreateFoundation(organizationId);
	const [dialog, setDialog] = useState<DialogKind | null>(null);

	if (error !== null) {
		return (
			<AdminPage icon={FoundationsIcon} title="Foundations">
				<AdminError error={error} />
			</AdminPage>
		);
	}

	if (isPending || data === undefined) {
		return (
			<AdminPage icon={FoundationsIcon} title="Foundations">
				<AdminLoading rows={4} />
			</AdminPage>
		);
	}

	const enabledSpeciesIds = new Set(data.organizationSpecies.map((row) => row.speciesId));
	const availableSpecies = data.species.filter((row) => !enabledSpeciesIds.has(row.id));
	const enabledSpecies = data.species.filter((row) => enabledSpeciesIds.has(row.id));
	const steps = readinessSteps(data, enabledSpecies.length);

	async function run(label: string, action: () => Promise<unknown>) {
		try {
			await action();
			toast.success(`${label} added.`);
			setDialog(null);
		} catch (caught) {
			toast.error(caught instanceof Error ? caught.message : `Unable to add the ${label}.`);
		}
	}

	return (
		<AdminPage
			description="Reference data this agency needs before its crews can record anything. These can only be added here — the agency edits and removes them from the SIMMER web app."
			icon={FoundationsIcon}
			title="Foundations"
		>
			<AgencySessionGate
				agencyName={agency?.name}
				organizationId={organizationId}
				workosOrganizationId={agency?.workosOrganizationId ?? null}
			>
				<Readiness steps={steps} />

				<FoundationGroup
					description="What this agency's forms offer when crews record work. A trap records against a collection method, so methods come before traps."
					title="Field vocabulary"
				>
					<ChipSection
						addLabel="Add method"
						emptyMessage="None yet. A trap cannot be added until there is at least one."
						names={data.lookups.collectionMethods.map(lookupName)}
						onAdd={() => setDialog({ kind: 'lookup', lookupKind: 'collection_methods' })}
						title="Collection methods"
					/>
					<ChipSection
						addLabel="Add lure"
						emptyMessage="None yet. Optional — traps can run unbaited."
						names={data.lookups.collectionLures.map(lookupName)}
						onAdd={() => setDialog({ kind: 'lookup', lookupKind: 'collection_lures' })}
						title="Collection lures"
					/>
					<ChipSection
						addLabel="Add habitat type"
						emptyMessage="None yet. Larval habitats are classified with these."
						names={data.lookups.habitatTypes.map(lookupName)}
						onAdd={() => setDialog({ kind: 'lookup', lookupKind: 'habitat_types' })}
						title="Habitat types"
					/>
				</FoundationGroup>

				<FoundationGroup
					description="Where the agency works. Regions are the districts crews are assigned across; addresses are the fixed places traps and service requests reference."
					title="Geography"
				>
					<RecordSection
						addLabel="Add region"
						emptyMessage="No regions. Load the agency's district boundaries from the KML or GeoJSON they sent."
						icon={RegionIcon}
						items={data.regions.map((region) => ({
							id: region.id,
							title: region.name,
							subtitle:
								data.regionFolders.find((folder) => folder.id === region.regionFolderId)?.name ??
								'Unfiled',
						}))}
						onAdd={() => setDialog({ kind: 'region' })}
						secondaryAction={
							<Button
								onClick={() => setDialog({ kind: 'region-folder' })}
								size="sm"
								variant="ghost"
							>
								Add folder
							</Button>
						}
						title="Regions"
					/>
					<RecordSection
						addLabel="Add address"
						emptyMessage="No addresses yet."
						icon={AddressIcon}
						items={data.addresses.map((address) => ({
							id: address.id,
							title: address.displayName,
							subtitle: [address.locality, address.region, address.postalCode]
								.filter((part) => part !== null && part !== '')
								.join(', '),
						}))}
						onAdd={() => setDialog({ kind: 'address' })}
						title="Addresses"
					/>
				</FoundationGroup>

				<FoundationGroup
					description="Narrowing the global species list to what actually occurs locally is what keeps identification screens usable in the field."
					title="Species"
				>
					<ChipSection
						addLabel="Enable species"
						disabledReason={
							availableSpecies.length === 0 && enabledSpecies.length > 0
								? 'Every species in the global list is already enabled.'
								: undefined
						}
						emptyMessage="None enabled. Crews will see the entire global list until one is."
						names={enabledSpecies.map((species) => species.displayName)}
						onAdd={() => setDialog({ kind: 'species' })}
						title="Enabled species"
					/>
				</FoundationGroup>

				<FoundationGroup
					description="The agency's first traps. Crews add the rest themselves once they can sign in."
					title="Traps"
				>
					<RecordSection
						addLabel="Add trap"
						disabledReason={
							data.lookups.collectionMethods.length === 0
								? 'Add a collection method first — a trap records against one.'
								: undefined
						}
						emptyMessage="No traps yet."
						icon={TrapIcon}
						items={data.traps.map((trap) => ({
							id: trap.id,
							title: trap.trapName ?? trap.trapCode ?? 'Unnamed trap',
							subtitle:
								data.lookups.collectionMethods.find(
									(method) => method.id === trap.collectionMethodId,
								)?.name ?? 'Unknown method',
							badge: trap.isActive ? undefined : 'Inactive',
						}))}
						onAdd={() => setDialog({ kind: 'trap' })}
						title="Traps"
					/>
				</FoundationGroup>

				<RecordDialog
					description={dialogDescription(dialog)}
					onOpenChange={(open) => {
						if (!open) {
							setDialog(null);
						}
					}}
					open={dialog !== null}
					title={dialogTitle(dialog)}
				>
					{dialog === null ? null : (
						<FoundationForm
							availableSpecies={availableSpecies}
							create={create}
							dialog={dialog}
							foundations={data}
							onSubmit={run}
						/>
					)}
				</RecordDialog>
			</AgencySessionGate>
		</AdminPage>
	);
}

function lookupName(lookup: { readonly name: string; readonly isActive: boolean }): string {
	return lookup.isActive ? lookup.name : `${lookup.name} (inactive)`;
}

interface ReadinessStep {
	readonly label: string;
	readonly done: boolean;
	/** What this unblocks, shown when it is the next thing outstanding. */
	readonly unblocks: string;
}

/**
 * The four things that have to exist before an agency's crews can record
 * anything, in the order they have to happen.
 *
 * Addresses, lures, and folders are absent on purpose: all three are genuinely
 * optional, and a checklist that lists optional work teaches an operator to
 * ignore it.
 */
function readinessSteps(data: AgencyFoundations, enabledSpeciesCount: number): ReadinessStep[] {
	return [
		{
			label: 'A region',
			done: data.regions.length > 0,
			unblocks: 'crews can be assigned across districts',
		},
		{
			label: 'A collection method',
			done: data.lookups.collectionMethods.length > 0,
			unblocks: 'traps can be added',
		},
		{
			label: 'A habitat type',
			done: data.lookups.habitatTypes.length > 0,
			unblocks: 'larval habitats can be classified',
		},
		{
			label: 'An enabled species',
			done: enabledSpeciesCount > 0,
			unblocks: 'identification screens are scoped to what occurs locally',
		},
	];
}

/**
 * What is still outstanding, named.
 *
 * Not a metric tile: the number alone ("3 / 4") tells an operator nothing they
 * can act on. The useful sentence is which step is next and what it unblocks, so
 * that is the sentence. Once everything is in place the block collapses to a
 * single confirming line rather than persisting as decoration.
 */
function Readiness({ steps }: { readonly steps: readonly ReadinessStep[] }) {
	const outstanding = steps.filter((step) => !step.done);
	const next = outstanding[0];

	if (next === undefined) {
		return (
			<p className="m-0 flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-4 py-3 text-foreground text-sm">
				<CheckIcon aria-hidden="true" className="size-4 shrink-0 text-success" />
				This agency has everything its crews need to start recording work.
			</p>
		);
	}

	return (
		<div className="grid gap-3 rounded-md border border-border/60 bg-muted/30 px-4 py-3.5">
			<p className="m-0 text-foreground text-sm">
				<span className="font-medium">{next.label.replace(/^An? /, '')}</span> is the next thing
				this agency needs — {next.unblocks}.
			</p>
			<ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
				{steps.map((step) => (
					<li
						className={`flex items-center gap-1.5 text-xs ${
							step.done ? 'text-muted-foreground' : 'font-medium text-foreground'
						}`}
						key={step.label}
					>
						{step.done ? (
							<CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
						) : (
							/*
							 * An open ring rather than a second icon: "not done" is the absence
							 * of the check, and status here never rests on colour alone — the
							 * outstanding entries also carry the heavier weight.
							 */
							<span
								aria-hidden="true"
								className="size-3.5 shrink-0 rounded-full border border-border-strong"
							/>
						)}
						<span>{step.label.replace(/^An? /, '')}</span>
						<span className="sr-only">{step.done ? ' — in place' : ' — still needed'}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/** A titled stage of the setup sequence. */
function FoundationGroup({
	title,
	description,
	children,
}: {
	readonly title: string;
	readonly description: string;
	readonly children: ReactNode;
}) {
	return (
		<section className="grid gap-4 border-border/60 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0">
			<div className="grid gap-1">
				<h2 className="m-0 font-semibold text-base text-foreground">{title}</h2>
				<p className="m-0 max-w-[70ch] text-muted-foreground text-sm leading-snug">{description}</p>
			</div>
			{children}
		</section>
	);
}

/** The heading row a section inside a group carries: name, count, add. */
function SectionHead({
	title,
	count,
	addLabel,
	disabledReason,
	secondaryAction,
	onAdd,
}: {
	readonly title: string;
	readonly count: number;
	readonly addLabel: string;
	readonly disabledReason?: string | undefined;
	readonly secondaryAction?: ReactNode;
	readonly onAdd: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<div className="flex items-baseline gap-2">
				<h3 className="m-0 font-medium text-foreground text-sm">{title}</h3>
				<span className="text-muted-foreground text-xs tabular-nums">{count}</span>
			</div>
			<div className="flex items-center gap-1">
				{secondaryAction}
				<Button
					disabled={disabledReason !== undefined}
					onClick={onAdd}
					size="sm"
					title={disabledReason}
					type="button"
					variant="outline"
				>
					<AddIcon aria-hidden="true" />
					{addLabel}
				</Button>
			</div>
		</div>
	);
}

/**
 * A list of bare names, as wrapped chips.
 *
 * Collection methods and enabled species are one string each. Rendering twenty
 * of them as full-width rows with an empty second line wastes the page and makes
 * a set of twenty look like twenty decisions; as chips the whole vocabulary is
 * one glance.
 */
function ChipSection({
	title,
	names,
	addLabel,
	emptyMessage,
	disabledReason,
	onAdd,
}: {
	readonly title: string;
	readonly names: readonly string[];
	readonly addLabel: string;
	readonly emptyMessage: string;
	readonly disabledReason?: string | undefined;
	readonly onAdd: () => void;
}) {
	return (
		<div className="grid gap-2">
			<SectionHead
				addLabel={addLabel}
				count={names.length}
				disabledReason={disabledReason}
				onAdd={onAdd}
				title={title}
			/>
			{names.length === 0 ? (
				<p className="m-0 rounded-md bg-muted/40 px-3 py-2.5 text-muted-foreground text-sm">
					{emptyMessage}
				</p>
			) : (
				<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
					{names.map((name) => (
						<li
							className="rounded-md border border-border/60 bg-card px-2 py-1 text-foreground text-xs"
							key={name}
						>
							{name}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

interface RecordItem {
	readonly id: string;
	readonly title: string;
	readonly subtitle?: string | null;
	readonly badge?: string | undefined;
}

/** A list of records that carry a second line worth reading. */
function RecordSection({
	title,
	icon: SectionIcon,
	items,
	addLabel,
	emptyMessage,
	disabledReason,
	secondaryAction,
	onAdd,
}: {
	readonly title: string;
	readonly icon: RegistryIcon;
	readonly items: readonly RecordItem[];
	readonly addLabel: string;
	readonly emptyMessage: string;
	readonly disabledReason?: string | undefined;
	readonly secondaryAction?: ReactNode;
	readonly onAdd: () => void;
}) {
	return (
		<div className="grid gap-2">
			<SectionHead
				addLabel={addLabel}
				count={items.length}
				disabledReason={disabledReason}
				onAdd={onAdd}
				secondaryAction={secondaryAction}
				title={title}
			/>
			{items.length === 0 ? (
				<p className="m-0 flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-muted-foreground text-sm">
					<SectionIcon aria-hidden="true" className="size-4 shrink-0 opacity-60" />
					{disabledReason ?? emptyMessage}
				</p>
			) : (
				<div className="max-h-72 overflow-y-auto">
					<CatalogList>
						{items.map((item) => (
							<CatalogRow
								badges={
									item.badge === undefined ? undefined : (
										<Badge tone="neutral" variant="outline">
											{item.badge}
										</Badge>
									)
								}
								key={item.id}
								subtitle={item.subtitle}
								title={item.title}
							/>
						))}
					</CatalogList>
				</div>
			)}
		</div>
	);
}

type DialogKind =
	| { readonly kind: 'region-folder' }
	| { readonly kind: 'region' }
	| { readonly kind: 'address' }
	| { readonly kind: 'species' }
	| { readonly kind: 'trap' }
	| { readonly kind: 'lookup'; readonly lookupKind: LookupKind };

const LOOKUP_LABELS: Readonly<Record<LookupKind, string>> = {
	collection_methods: 'Collection Method',
	collection_lures: 'Collection Lure',
	habitat_types: 'Habitat Type',
};

function dialogTitle(dialog: DialogKind | null): string {
	if (dialog === null) {
		return '';
	}
	switch (dialog.kind) {
		case 'region-folder':
			return 'Add Region Folder';
		case 'region':
			return 'Add Region';
		case 'address':
			return 'Add Address';
		case 'species':
			return 'Enable Species';
		case 'trap':
			return 'Add Trap';
		case 'lookup':
			return `Add ${LOOKUP_LABELS[dialog.lookupKind]}`;
	}
}

function dialogDescription(dialog: DialogKind | null): string {
	if (dialog === null) {
		return '';
	}
	if (dialog.kind === 'species') {
		return 'Enabling a species adds it to this agency’s identification lists. The global species list itself is managed under Taxonomy.';
	}
	return 'Added for this agency only. It can be edited or removed from the SIMMER web app.';
}

/**
 * One form per foundation kind.
 *
 * These were a single component with a six-way switch in its body and another in
 * its submit, over fifteen `useState` hooks — every field every kind might need,
 * held at once. It read as one form that could not decide what it was, and the
 * complexity gate agreed. Each kind now owns only its own fields and its own
 * submit, and the dialog picks between them.
 */
function FoundationForm({
	dialog,
	foundations,
	availableSpecies,
	create,
	onSubmit,
}: {
	readonly dialog: DialogKind;
	readonly foundations: AgencyFoundations;
	readonly availableSpecies: AgencyFoundations['species'];
	readonly create: ReturnType<typeof useCreateFoundation>;
	readonly onSubmit: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
	switch (dialog.kind) {
		case 'region-folder':
			return <RegionFolderForm create={create} onSubmit={onSubmit} />;
		case 'region':
			return <RegionForm create={create} folders={foundations.regionFolders} onSubmit={onSubmit} />;
		case 'address':
			return <AddressForm create={create} onSubmit={onSubmit} />;
		case 'species':
			return <SpeciesForm available={availableSpecies} create={create} onSubmit={onSubmit} />;
		case 'lookup':
			return <LookupForm create={create} kind={dialog.lookupKind} onSubmit={onSubmit} />;
		case 'trap':
			return <TrapForm create={create} foundations={foundations} onSubmit={onSubmit} />;
	}
}

/** Shared submit row, so every kind's dialog ends the same way. */
function FormFooter({
	disabled,
	pending,
}: {
	readonly disabled: boolean;
	readonly pending: boolean;
}) {
	return (
		<div className="flex justify-end">
			<Button disabled={pending || disabled} type="submit">
				{pending ? 'Saving…' : 'Add'}
			</Button>
		</div>
	);
}

function RegionFolderForm({
	create,
	onSubmit,
}: {
	readonly create: ReturnType<typeof useCreateFoundation>;
	readonly onSubmit: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');

	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				void onSubmit('Folder', () =>
					create.regionFolder.mutateAsync({ name: name.trim(), description }),
				);
			}}
		>
			<TextRow
				label="Folder name"
				onChange={setName}
				placeholder="e.g. North district"
				required
				value={name}
			/>
			<TextAreaRow label="Description" onChange={setDescription} value={description} />
			<FormFooter disabled={name.trim() === ''} pending={create.regionFolder.isPending} />
		</form>
	);
}

function RegionForm({
	create,
	folders,
	onSubmit,
}: {
	readonly create: ReturnType<typeof useCreateFoundation>;
	readonly folders: AgencyFoundations['regionFolders'];
	readonly onSubmit: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [folderId, setFolderId] = useState('');
	const [geometry, setGeometry] = useState<GeoJsonGeometry | null>(null);

	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (geometry === null) {
					return;
				}
				void onSubmit('Region', () =>
					create.region.mutateAsync({
						name: name.trim(),
						regionFolderId: folderId === '' ? null : folderId,
						description,
						geojson: geometry,
					}),
				);
			}}
		>
			<TextRow
				label="Region name"
				onChange={setName}
				placeholder="e.g. Zone 4"
				required
				value={name}
			/>
			<Field>
				<FieldLabel htmlFor="region-folder">Folder</FieldLabel>
				<NativeSelect
					id="region-folder"
					onChange={(event) => setFolderId(event.target.value)}
					value={folderId}
				>
					<option value="">Unfiled</option>
					{folders.map((folder) => (
						<option key={folder.id} value={folder.id}>
							{folder.name}
						</option>
					))}
				</NativeSelect>
			</Field>
			<TextAreaRow label="Description" onChange={setDescription} value={description} />
			<GeometryFileInput
				description="The district boundary, from the customer's KML or GeoJSON."
				kinds={POLYGON_ONLY}
				label="Boundary"
				onChange={setGeometry}
				value={geometry}
			/>
			<FormFooter
				disabled={name.trim() === '' || geometry === null}
				pending={create.region.isPending}
			/>
		</form>
	);
}

function AddressForm({
	create,
	onSubmit,
}: {
	readonly create: ReturnType<typeof useCreateFoundation>;
	readonly onSubmit: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
	const [displayName, setDisplayName] = useState('');
	const [addressLine1, setAddressLine1] = useState('');
	const [locality, setLocality] = useState('');
	const [region, setRegion] = useState('');
	const [postalCode, setPostalCode] = useState('');
	const [country, setCountry] = useState('US');
	const [point, setPoint] = useState<GeoJsonPoint | null>(null);

	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (point === null) {
					return;
				}
				void onSubmit('Address', () =>
					create.address.mutateAsync({
						displayName: displayName.trim(),
						country,
						addressLine1,
						addressLine2: '',
						locality,
						region,
						postalCode,
						geojson: point,
					}),
				);
			}}
		>
			<TextRow
				label="Display name"
				onChange={setDisplayName}
				placeholder="e.g. District yard"
				required
				value={displayName}
			/>
			<TextRow label="Address line 1" onChange={setAddressLine1} value={addressLine1} />
			<div className="grid gap-4 sm:grid-cols-2">
				<TextRow label="City" onChange={setLocality} value={locality} />
				<TextRow label="State or region" onChange={setRegion} value={region} />
				<TextRow label="Postal code" onChange={setPostalCode} value={postalCode} />
				<TextRow
					label="Country"
					maxLength={2}
					onChange={setCountry}
					placeholder="US"
					required
					value={country}
				/>
			</div>
			<PointInput
				description="Where this address sits. Two decimal degrees, WGS84."
				label="Location"
				onChange={setPoint}
				value={point}
			/>
			<FormFooter
				disabled={displayName.trim() === '' || country.trim().length !== 2 || point === null}
				pending={create.address.isPending}
			/>
		</form>
	);
}

function SpeciesForm({
	available,
	create,
	onSubmit,
}: {
	readonly available: AgencyFoundations['species'];
	readonly create: ReturnType<typeof useCreateFoundation>;
	readonly onSubmit: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
	const [speciesId, setSpeciesId] = useState('');

	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				void onSubmit('Species', () => create.species.mutateAsync(speciesId));
			}}
		>
			<Field>
				<FieldLabel htmlFor="species-select">Species</FieldLabel>
				<NativeSelect
					id="species-select"
					onChange={(event) => setSpeciesId(event.target.value)}
					value={speciesId}
				>
					<option value="">Choose a species…</option>
					{available.map((species) => (
						<option key={species.id} value={species.id}>
							{species.displayName}
							{species.commonName === null ? '' : ` — ${species.commonName}`}
						</option>
					))}
				</NativeSelect>
			</Field>
			<FormFooter disabled={speciesId === ''} pending={create.species.isPending} />
		</form>
	);
}

function LookupForm({
	kind,
	create,
	onSubmit,
}: {
	readonly kind: LookupKind;
	readonly create: ReturnType<typeof useCreateFoundation>;
	readonly onSubmit: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [actionThreshold, setActionThreshold] = useState('');

	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				const threshold = Number.parseInt(actionThreshold, 10);
				void onSubmit(LOOKUP_LABELS[kind], () =>
					create.lookup.mutateAsync({
						kind,
						input: {
							name: name.trim(),
							description,
							actionThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : null,
						},
					}),
				);
			}}
		>
			<TextRow label="Name" onChange={setName} required value={name} />
			<TextAreaRow label="Description" onChange={setDescription} value={description} />
			{/* No "Active" toggle: a catalog entry is created live and retired
			    later, which is an update the agency makes in its own workspace. */}
			<Field>
				<FieldLabel htmlFor="lookup-threshold">Action threshold</FieldLabel>
				<Input
					id="lookup-threshold"
					inputMode="numeric"
					onChange={(event) => setActionThreshold(event.target.value)}
					placeholder="Optional"
					value={actionThreshold}
				/>
			</Field>
			<FormFooter disabled={name.trim() === ''} pending={create.lookup.isPending} />
		</form>
	);
}

function TrapForm({
	foundations,
	create,
	onSubmit,
}: {
	readonly foundations: AgencyFoundations;
	readonly create: ReturnType<typeof useCreateFoundation>;
	readonly onSubmit: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
	const [trapName, setTrapName] = useState('');
	const [trapCode, setTrapCode] = useState('');
	const [methodId, setMethodId] = useState('');
	const [lureId, setLureId] = useState('');
	const [addressId, setAddressId] = useState('');
	const [point, setPoint] = useState<GeoJsonPoint | null>(null);

	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (point === null) {
					return;
				}
				void onSubmit('Trap', () =>
					create.trap.mutateAsync({
						collectionMethodId: methodId,
						addressId: addressId === '' ? null : addressId,
						collectionLureId: lureId === '' ? null : lureId,
						trapName,
						trapCode,
						description: '',
						geojson: point,
					}),
				);
			}}
		>
			<TextRow label="Trap name" onChange={setTrapName} value={trapName} />
			<TextRow label="Trap code" onChange={setTrapCode} value={trapCode} />
			<Field>
				<FieldLabel htmlFor="trap-method">Collection method</FieldLabel>
				<NativeSelect
					id="trap-method"
					onChange={(event) => setMethodId(event.target.value)}
					value={methodId}
				>
					<option value="">Choose a method…</option>
					{foundations.lookups.collectionMethods.map((method) => (
						<option key={method.id} value={method.id}>
							{method.name}
						</option>
					))}
				</NativeSelect>
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="trap-lure">Lure</FieldLabel>
					<NativeSelect
						id="trap-lure"
						onChange={(event) => setLureId(event.target.value)}
						value={lureId}
					>
						<option value="">None</option>
						{foundations.lookups.collectionLures.map((lure) => (
							<option key={lure.id} value={lure.id}>
								{lure.name}
							</option>
						))}
					</NativeSelect>
				</Field>
				<Field>
					<FieldLabel htmlFor="trap-address">Address</FieldLabel>
					<NativeSelect
						id="trap-address"
						onChange={(event) => setAddressId(event.target.value)}
						value={addressId}
					>
						<option value="">None</option>
						{foundations.addresses.map((address) => (
							<option key={address.id} value={address.id}>
								{address.displayName}
							</option>
						))}
					</NativeSelect>
				</Field>
			</div>
			<PointInput
				description="Where the trap is set. Two decimal degrees, WGS84."
				label="Location"
				onChange={setPoint}
				value={point}
			/>
			<FormFooter disabled={methodId === '' || point === null} pending={create.trap.isPending} />
		</form>
	);
}

function TextRow({
	label,
	value,
	onChange,
	placeholder,
	required = false,
	maxLength,
}: {
	readonly label: string;
	readonly value: string;
	readonly onChange: (next: string) => void;
	readonly placeholder?: string;
	readonly required?: boolean;
	readonly maxLength?: number;
}) {
	const id = `foundation-${label.toLowerCase().replace(/\s+/g, '-')}`;
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				{...(maxLength === undefined ? {} : { maxLength })}
				onChange={(event) => onChange(event.target.value)}
				{...(placeholder === undefined ? {} : { placeholder })}
				required={required}
				value={value}
			/>
		</Field>
	);
}

function TextAreaRow({
	label,
	value,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly onChange: (next: string) => void;
}) {
	const id = `foundation-${label.toLowerCase().replace(/\s+/g, '-')}`;
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Textarea id={id} onChange={(event) => onChange(event.target.value)} rows={2} value={value} />
		</Field>
	);
}
