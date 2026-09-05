import type { SpeciesSex, SpeciesStatus } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { customSchemaFor, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Autocomplete } from '@simmer-mosquito/ui-web/components/ui/autocomplete';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { NumberInput } from '@simmer-mosquito/ui-web/components/ui/number-input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry, KeyboardIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { type AskAcknowledged, useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CollectCollectionDialog } from '../../../components/collect-collection-dialog';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { EmptyValue } from '../../../components/empty-value';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	RecordDetailColumns,
	RecordDetailHeader,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useCollectionMutations } from '../../../hooks/mutations/use-collection-mutations';
import {
	type CollectionSpeciesChanges,
	useCollectionSpeciesMutations,
} from '../../../hooks/mutations/use-collection-species-mutations';
import type { AdultCollection } from '../../../hooks/queries/collection-view';
import { trapDisplayName } from '../../../hooks/queries/trap-view';
import { useAdultCollection } from '../../../hooks/queries/use-adult-collection';
import { useCollectionMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import {
	type CollectionIdentification,
	useCollectionIdentifications,
} from '../../../hooks/queries/use-collection-identifications';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useSpeciesCatalog } from '../../../hooks/queries/use-species-catalog';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import {
	COLLECTION_DELETE_REFUSALS,
	COLLECTION_ZERO_RESULT_REFUSALS,
} from '../../../lib/acknowledgement-copy';
import { operationalDayAsTimestamp } from '../../../lib/local-date';
import {
	CollectionFlagBadges,
	collectionEffectiveDate,
	collectionTitle,
	isPendingCollection,
	SPECIES_SEX_VALUES,
	SPECIES_STATUS_VALUES,
	SpeciesSexBadge,
	SpeciesStatusBadge,
	speciesSexLabel,
	speciesStatusLabel,
} from '../-adult-display';
import { CollectionKeyEntryDialog } from '../-collection-key-entry';
import { formatWeekdayMonthDay, todayInTimeZone } from '../-overview-data';

export const Route = createFileRoute('/adult-surveillance/collections/$id')({
	component: RouteComponent,
});

const CollectionIcon = iconRegistry.entities.collection.icon;
// Identification is about the mosquitoes in the sample, not the taxonomy tree the
// names come from — the same mark heads the card on larval samples.
const SpeciesIcon = iconRegistry.simmer.mosquito.icon;
const TrapIcon = iconRegistry.entities.trap.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

const collectionGcTimeMs = 30_000;

// Roles that get a read-only view of a collection — no flag toggles, species
// edits, or additions (mirrors the comments thread's read-only gate).
const READ_ONLY_ROLES = new Set(['viewer']);

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { eyebrow: 'w-24', main: ['h-[360px]', 'h-64'], aside: ['h-72'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const snapshot = auth.snapshot?.authenticated === true ? auth.snapshot : null;
	const role = snapshot?.localIdentity.role ?? null;
	const canEdit = snapshot !== null && !(role !== null && READ_ONLY_ROLES.has(role));
	const { collection, isReady } = useAdultCollection(id, { gcTime: collectionGcTimeMs });

	return (
		<RecordDetailPage
			back={{ label: 'Back to collections', to: '/adult-surveillance/collections' }}
			deleteRefusals={COLLECTION_DELETE_REFUSALS}
			layout={layout}
			noun="collection"
			reading={{ isReady, record: collection }}
		>
			{(record, askDelete) => (
				<CollectionDetailContent askDelete={askDelete} canEdit={canEdit} collection={record} />
			)}
		</RecordDetailPage>
	);
}

function CollectionDetailContent({
	collection,
	canEdit,
	askDelete,
}: {
	readonly collection: AdultCollection;
	readonly canEdit: boolean;
	readonly askDelete: AskAcknowledged;
}) {
	const titleTimeZone = useOrganizationTimeZone();
	const title = collectionTitle(collection, titleTimeZone);
	useBreadcrumbLabel(collection.id, title);

	// The method roster is still read, because the custom-field schema hangs off
	// the collection method and a schema is not something a `select` can join. The
	// trap, the method name and the lure name are joined by the read seam now —
	// three lookups against three rosters gone, and with them the chance of an id
	// resolving to nothing because its roster had not streamed yet.
	const methods = useCollectionMethodRoster();
	const profiles = useProfileRoster();
	const mutations = useCollectionMutations();

	const { methodName } = collection;
	// Guarded on the collection's own column rather than the joined name: a
	// collection set without a lure reads as no lure, while one whose lure has
	// since been deleted reads as an unknown one, and collapsing those would
	// quietly turn a deleted catalog row into a blank.
	const lureName = collection.lureId === null ? null : (collection.lureName ?? 'Unknown lure');
	const profileNameById = useMemo(
		() => new Map(profiles.map((profile) => [profile.id, profile.displayName])),
		[profiles],
	);

	return (
		<RecordDetailColumns
			aside={
				<>
					<DetailsCard
						collection={collection}
						lureName={lureName}
						methodName={methodName}
						profileNameById={profileNameById}
					/>
					<CustomFieldsCard
						metadata={collection.metadata}
						schema={customSchemaFor(methods, collection.methodId)}
					/>
					<CommentsSection
						description="Field notes, identification remarks, and follow-up for this collection."
						target={{ type: 'collection', id: collection.id }}
					/>
				</>
			}
			header={
				<RecordDetailHeader
					actions={
						<>
							<CollectionFlagBadges
								className="flex flex-wrap items-center gap-1.5"
								collection={collection}
							/>
							{canEdit && isPendingCollection(collection) ? (
								<WriteOnly>
									<CollectCollectionButton collection={collection} />
								</WriteOnly>
							) : null}
							{canEdit ? (
								<WriteOnly>
									<Button asChild size="sm" variant="outline">
										<Link
											params={{ id: collection.id }}
											to="/adult-surveillance/collections/$id/edit"
										>
											<EditIcon aria-hidden="true" />
											Edit
										</Link>
									</Button>
								</WriteOnly>
							) : null}
						</>
					}
					eyebrow="Collection"
					icon={CollectionIcon}
					subtitle={`${collection.trapId === null ? 'Ad-hoc collection' : trapDisplayName(collection)} · ${methodName}`}
					title={title}
				/>
			}
			layout={layout}
		>
			<div className="grid content-start gap-3">
				<CollectionLocationCard collection={collection} />
				<RecordRegionsBand noun="collection" recordId={collection.id} recordType="collections" />
			</div>
			<ResultsCard canEdit={canEdit} collection={collection} />
			<DangerZoneCard
				ask={askDelete}
				name={title}
				noun="collection"
				onDelete={(acknowledgements) => mutations.remove(collection.id, acknowledgements)}
				recordId={collection.id}
				recordType="collection"
				returnTo="/adult-surveillance/collections"
			/>
		</RecordDetailColumns>
	);
}

/** The second visit, on a trap that is still out. */
function CollectCollectionButton({ collection }: { readonly collection: AdultCollection }) {
	const [open, setOpen] = useState(false);
	const { run: runAcknowledged, dialog: acknowledgeDialog } = useAcknowledgedWrite();
	const timeZone = useOrganizationTimeZone();
	const { collect } = useCollectionMutations();

	return (
		<>
			<Button onClick={() => setOpen(true)} size="sm" variant="default">
				Collect
			</Button>
			<CollectCollectionDialog
				defaultDate={todayInTimeZone(timeZone)}
				onConfirm={(collectedAt) => {
					setOpen(false);
					void runAcknowledged((acknowledgements) =>
						collect({
							acknowledgements,
							// Midday on the organization's clock, clamped back to now on the
							// same day — the same stamp the collection forms use, and the one
							// every surface reads the day back with.
							collectedAt: operationalDayAsTimestamp(collectedAt, timeZone) ?? new Date(),
							collectionId: collection.id,
						}),
					);
				}}
				onOpenChange={setOpen}
				open={open}
			/>
			{acknowledgeDialog}
		</>
	);
}

// --- location ----------------------------------------------------------------

function CollectionLocationCard({ collection }: { readonly collection: AdultCollection }) {
	const { latitude: lat, longitude: lng } = collection;
	return (
		<RecordLocationCard
			description={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
			emptyDescription="This collection has no location to display."
			geojson={{ type: 'Point', coordinates: [lng, lat] } as GeoJsonGeometry}
			geomType="Point"
			height="h-[280px]"
		/>
	);
}

// --- results (flags + species) -----------------------------------------------

interface SpeciesOption {
	readonly value: string;
	readonly label: string;
}

/** Species names are binomials, so they read italic wherever they appear. */
function renderSpeciesOption(option: SpeciesOption) {
	return <span className="italic">{option.label}</span>;
}

function ResultsCard({
	collection,
	canEdit,
}: {
	readonly collection: AdultCollection;
	readonly canEdit: boolean;
}) {
	const speciesRows = useSpeciesCatalog();
	// Sorted once here so every species picker/select on the page reads alphabetically.
	const species = useMemo(
		() => [...speciesRows].sort((a, b) => a.displayName.localeCompare(b.displayName)),
		[speciesRows],
	);
	const speciesOptions = useMemo(
		() => species.map((row) => ({ value: row.id, label: row.displayName })),
		[species],
	);
	const speciesNameById = useMemo(
		() => new Map(species.map((row) => [row.id, row.displayName])),
		[species],
	);

	const {
		identifications: entries,
		isReady,
		isError,
	} = useCollectionIdentifications(collection.id);
	const total = useMemo(
		() => entries.reduce((sum, entry) => sum + (entry.count ?? 0), 0),
		[entries],
	);

	const [keyEntryOpen, setKeyEntryOpen] = useState(false);

	const { setZeroResult, setBycatch, setProblem } = useCollectionMutations();
	const speciesMutations = useCollectionSpeciesMutations();
	const { run, dialog } = useAcknowledgedWrite({
		askable: COLLECTION_ZERO_RESULT_REFUSALS,
		ask: true,
	});

	// Marking a collection zero-result clears every recorded species server-side
	// (see markCollectionZeroResult), so the flag goes out withheld and the count
	// in the question is the server's own. This page used to count `entries` and
	// ask on its own, which meant a list that had not finished streaming, or one
	// another crew had added to, asked about the wrong number or did not ask.
	const handleZeroResultChange = useCallback(
		(value: boolean) => {
			void run((acknowledgements) => setZeroResult(collection.id, value, acknowledgements));
		},
		[run, setZeroResult, collection.id],
	);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<SpeciesIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Identification
						</CardTitle>
						<CardDescription>
							Collection flags and the specimens identified in this sample.
						</CardDescription>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{entries.length > 0 ? (
							<Badge tone="neutral" variant="outline">
								{total.toLocaleString()} specimens
							</Badge>
						) : null}
						{canEdit && !collection.isZeroResult ? (
							<Button
								onClick={() => setKeyEntryOpen(true)}
								size="sm"
								type="button"
								variant="outline"
							>
								<KeyboardIcon aria-hidden="true" />
								Key entry
							</Button>
						) : null}
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<div className="grid gap-3 rounded-md border border-border/40 bg-muted/20 p-3">
					<FlagRow
						checked={collection.isZeroResult}
						description="No specimens were collected."
						disabled={!canEdit}
						label="Zero result"
						onChange={handleZeroResultChange}
					/>
					<FlagRow
						checked={collection.hasBycatch}
						description="Non-target specimens were present."
						disabled={!canEdit}
						label="Bycatch"
						onChange={(value) => void setBycatch(collection.id, value)}
					/>
					<FlagRow
						checked={collection.hasProblem}
						description="Trap failure, tampering, or a compromised sample."
						disabled={!canEdit}
						label="Problem"
						onChange={(value) => void setProblem(collection.id, value)}
					/>
				</div>

				<div className="grid gap-3">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						Species
					</span>
					{isError ? (
						<SpeciesEmpty
							description="Species records could not be loaded."
							title="Species Unavailable"
						/>
					) : !isReady ? (
						<div className="grid gap-2">
							{[0, 1].map((index) => (
								<Skeleton className="h-12 w-full" key={index} />
							))}
						</div>
					) : collection.isZeroResult ? (
						<SpeciesEmpty
							description="This collection is marked as a zero result. Turn off “Zero result” to record species."
							title="Zero Result"
						/>
					) : entries.length === 0 ? (
						<SpeciesEmpty
							description={
								canEdit
									? 'No species recorded yet. Add the specimens identified below.'
									: 'No species have been recorded for this collection.'
							}
							title="No Species Recorded"
						/>
					) : (
						<div className="overflow-hidden rounded-md border border-border/40">
							<Table>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead className="min-w-[12rem]">Species</TableHead>
										<TableHead className="w-[8.5rem]">Sex</TableHead>
										<TableHead className="w-[9.5rem]">Status</TableHead>
										<TableHead className="w-[9.5rem] text-right">Count</TableHead>
										{canEdit ? <TableHead className="w-10" /> : null}
									</TableRow>
								</TableHeader>
								<TableBody>
									{entries.map((entry) =>
										canEdit ? (
											<EditableSpeciesRow
												entry={entry}
												key={entry.id}
												onChange={speciesMutations.save}
												onRemove={speciesMutations.remove}
												speciesOptions={speciesOptions}
											/>
										) : (
											<ReadOnlySpeciesRow
												entry={entry}
												key={entry.id}
												speciesName={speciesNameById.get(entry.speciesId) ?? 'Unknown species'}
											/>
										),
									)}
								</TableBody>
							</Table>
						</div>
					)}

					{canEdit && !collection.isZeroResult ? (
						<AddSpeciesForm collectionId={collection.id} speciesOptions={speciesOptions} />
					) : null}
				</div>
			</CardContent>

			<CollectionKeyEntryDialog
				collectionId={collection.id}
				onOpenChange={setKeyEntryOpen}
				open={keyEntryOpen}
			/>

			{dialog}
		</Card>
	);
}

/**
 * A recorded specimen line as a viewer sees it: the values themselves, not the
 * editor's controls greyed out. A disabled input offers an affordance that cannot
 * be used and renders its own content muted, which is the harder thing to read of
 * the two. Larval samples present their read-only results the same way.
 */
function ReadOnlySpeciesRow({
	entry,
	speciesName,
}: {
	readonly entry: CollectionIdentification;
	readonly speciesName: string;
}) {
	return (
		<TableRow>
			<TableCell>
				<span className="italic">{speciesName}</span>
			</TableCell>
			<TableCell>
				{entry.sex === null ? <EmptyValue /> : <SpeciesSexBadge sex={entry.sex} />}
			</TableCell>
			<TableCell>
				{entry.status === null ? <EmptyValue /> : <SpeciesStatusBadge status={entry.status} />}
			</TableCell>
			{/* The column header already says Count, so the number stands on its own. */}
			<TableCell className="text-right font-medium tabular-nums">
				{entry.count.toLocaleString()}
			</TableCell>
		</TableRow>
	);
}

function EditableSpeciesRow({
	entry,
	speciesOptions,
	onChange,
	onRemove,
}: {
	readonly entry: CollectionIdentification;
	readonly speciesOptions: readonly SpeciesOption[];
	readonly onChange: (entryId: string, changes: CollectionSpeciesChanges) => void;
	readonly onRemove: (entryId: string) => void;
}) {
	return (
		<TableRow>
			<TableCell>
				<Autocomplete
					aria-label="Species"
					onValueChange={(next) => {
						// Clearing has no meaning here — a recorded specimen is always some
						// species — so only a real selection writes.
						if (next !== null) {
							onChange(entry.id, { speciesId: next });
						}
					}}
					options={speciesOptions}
					placeholder="Search species…"
					renderOption={renderSpeciesOption}
					renderSelectedValue={renderSpeciesOption}
					value={entry.speciesId}
				/>
			</TableCell>
			<TableCell>
				<Select
					onValueChange={(next) =>
						onChange(entry.id, { sex: next === 'unset' ? null : (next as SpeciesSex) })
					}
					value={entry.sex ?? 'unset'}
				>
					<SelectTrigger aria-label="Sex" className="w-full">
						<SelectValue placeholder="Unsexed" />
					</SelectTrigger>
					<SelectContent>
						{SEX_FIELD_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell>
				<Select
					onValueChange={(next) =>
						onChange(entry.id, { status: next === 'unset' ? null : (next as SpeciesStatus) })
					}
					value={entry.status ?? 'unset'}
				>
					<SelectTrigger aria-label="Status" className="w-full">
						<SelectValue placeholder="Not recorded" />
					</SelectTrigger>
					<SelectContent>
						{STATUS_FIELD_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell>
				<SpeciesCountCell
					onCommit={(next) => onChange(entry.id, { count: next })}
					value={entry.count}
				/>
			</TableCell>
			<TableCell className="text-right">
				<Button
					aria-label="Remove species"
					onClick={() => onRemove(entry.id)}
					size="icon"
					type="button"
					variant="ghost"
				>
					<DeleteIcon aria-hidden="true" className="size-4" />
				</Button>
			</TableCell>
		</TableRow>
	);
}

/**
 * The count cell: the shared {@link NumberInput} over a local draft, so typing
 * doesn't fire a write per keystroke. Commits a clamped integer (min 1) on blur /
 * Enter / stepper; a non-positive or empty value reverts to the stored count.
 */
function SpeciesCountCell({
	value,
	onCommit,
}: {
	readonly value: number;
	readonly onCommit: (next: number) => void;
}) {
	const [draft, setDraft] = useState<number | null>(value);
	// Re-sync the draft when the committed value changes elsewhere (optimistic
	// update settles, stepper fires, another editor). React adjust-during-render.
	const [syncedValue, setSyncedValue] = useState(value);
	if (syncedValue !== value) {
		setSyncedValue(value);
		setDraft(value);
	}

	return (
		<NumberInput
			aria-label="Count"
			className="w-full"
			min={1}
			onCommit={(next) => {
				// Revert empty / non-positive / non-numeric entries to the stored count.
				const resolved =
					next !== null && Number.isFinite(next) && next >= 1 ? Math.trunc(next) : value;
				setDraft(resolved);
				if (resolved !== value) {
					onCommit(resolved);
				}
			}}
			onValueChange={setDraft}
			value={draft}
		/>
	);
}

function AddSpeciesForm({
	collectionId,
	speciesOptions,
}: {
	readonly collectionId: string;
	readonly speciesOptions: readonly SpeciesOption[];
}) {
	const timeZone = useOrganizationTimeZone();
	const { add } = useCollectionSpeciesMutations();
	const form = useAppForm({
		defaultValues: {
			speciesId: null as string | null,
			count: null as number | null,
			sex: 'unset' as SpeciesSex | 'unset',
			status: 'unset' as SpeciesStatus | 'unset',
		},
		onSubmit: ({ value }) => {
			if (value.speciesId === null || value.count === null || value.count < 1) {
				return;
			}
			void add({
				collectionId,
				collectionSpeciesId: newRecordId(),
				// The organization's today, not the browser's: an identification keyed
				// at 11pm on a lab machine two zones away belongs to the day the
				// organization is having.
				identifiedDate: todayInTimeZone(timeZone),
				fields: {
					speciesId: value.speciesId,
					count: Math.trunc(value.count),
					sex: value.sex === 'unset' ? null : value.sex,
					status: value.status === 'unset' ? null : value.status,
				},
			});
			form.reset();
		},
	});

	return (
		<form.AppForm>
			<form
				className="grid gap-3 rounded-md border border-border/50 border-dashed bg-muted/20 p-3"
				onSubmit={(event) => {
					event.preventDefault();
					void form.handleSubmit();
				}}
			>
				<span className="font-medium text-foreground text-sm">Add species</span>
				<div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
					<form.AppField name="speciesId">
						{(field) => (
							<field.AutocompleteField
								options={speciesOptions}
								placeholder="Select species"
								renderOption={renderSpeciesOption}
								renderSelectedValue={renderSpeciesOption}
							/>
						)}
					</form.AppField>
					<form.AppField name="count">
						{(field) => <field.NumberField min={1} placeholder="Count" />}
					</form.AppField>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<form.AppField name="sex">
						{(field) => <field.SelectField options={SEX_FIELD_OPTIONS} placeholder="Unsexed" />}
					</form.AppField>
					<form.AppField name="status">
						{(field) => (
							<field.SelectField options={STATUS_FIELD_OPTIONS} placeholder="Not recorded" />
						)}
					</form.AppField>
				</div>
				<div className="flex justify-end">
					<form.Subscribe selector={(state) => state.values}>
						{(values) => (
							<Button
								disabled={values.speciesId === null || values.count === null || values.count < 1}
								size="sm"
								type="submit"
							>
								Add Species
							</Button>
						)}
					</form.Subscribe>
				</div>
			</form>
		</form.AppForm>
	);
}

// The "no selection" sentinel stays pinned first; the real values sort by label.
const SEX_FIELD_OPTIONS = [
	{ value: 'unset', label: 'Unsexed' },
	...SPECIES_SEX_VALUES.map((value) => ({ value, label: speciesSexLabel(value) })).sort((a, b) =>
		a.label.localeCompare(b.label),
	),
];

const STATUS_FIELD_OPTIONS = [
	{ value: 'unset', label: 'Not recorded' },
	...SPECIES_STATUS_VALUES.map((value) => ({ value, label: speciesStatusLabel(value) })).sort(
		(a, b) => a.label.localeCompare(b.label),
	),
];

function SpeciesEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[120px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SpeciesIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

// --- result flags ------------------------------------------------------------

function FlagRow({
	label,
	description,
	checked,
	onChange,
	disabled,
}: {
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly onChange: (value: boolean) => void;
	readonly disabled?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="grid gap-0.5">
				<span className="font-medium text-foreground text-sm">{label}</span>
				<span className="text-muted-foreground text-xs">{description}</span>
			</div>
			<Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
		</div>
	);
}

// --- details -----------------------------------------------------------------

function DetailsCard({
	collection,
	methodName,
	lureName,
	profileNameById,
}: {
	readonly collection: AdultCollection;
	readonly methodName: string;
	readonly lureName: string | null;
	readonly profileNameById: ReadonlyMap<string, string>;
}) {
	const timeZone = useOrganizationTimeZone();
	const collectedDate = collectionEffectiveDate(collection, timeZone);
	// The instant the trap went out, read back as the day the crew worked. The
	// read seam hands `started_at` up as the `Date` the row schema parses, so
	// this is where the organization's clock turns it into a calendar day — the
	// same clock `collectionEffectiveDate` reads the collected day on.
	const startedDay =
		collection.startedAt === null ? null : todayInTimeZone(timeZone, collection.startedAt);
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Trap">
						{collection.trapId === null ? (
							<span className="text-muted-foreground italic">Ad-hoc — no trap</span>
						) : (
							<Link
								className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: collection.trapId }}
								to="/adult-surveillance/traps/$id"
							>
								<TrapIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
								{trapDisplayName(collection)}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Lure">
						{lureName ?? <span className="text-muted-foreground">None</span>}
					</DetailRow>
					<DetailRow label="Collected">
						{collectedDate === null ? (
							<span className="text-muted-foreground">Pending</span>
						) : (
							formatWeekdayMonthDay(collectedDate)
						)}
					</DetailRow>
					<DetailRow label="Set">
						{startedDay === null ? <EmptyValue /> : formatWeekdayMonthDay(startedDay)}
					</DetailRow>
					<DetailRow label="Collected by">
						{collection.collectedByProfileId === null ? (
							<span className="text-muted-foreground">Unassigned</span>
						) : (
							(profileNameById.get(collection.collectedByProfileId) ?? 'Unknown')
						)}
					</DetailRow>
					<DetailRow label="Set by">
						{collection.setByProfileId === null ? (
							<span className="text-muted-foreground">Unassigned</span>
						) : (
							(profileNameById.get(collection.setByProfileId) ?? 'Unknown')
						)}
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={collection.addressId} />
					</DetailRow>
				</dl>
				<AdditionalPersonnelList target={{ type: 'collection', id: collection.id }} />
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[110px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

// --- states + helpers --------------------------------------------------------
