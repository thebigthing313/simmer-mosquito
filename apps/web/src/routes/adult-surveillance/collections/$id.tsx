import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	AdultCollectionRow,
	CollectionLureRow,
	CollectionMethodRow,
	CollectionSpeciesRow,
	ProfileRow,
	SpeciesRow,
	SpeciesSex,
	SpeciesStatus,
	TrapRow,
} from '@simmer-mosquito/sync';
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { customSchemaFor, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
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
import { ArrowLeftIcon, iconRegistry, KeyboardIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import {
	CollectCollectionDialog,
	collectPendingCollection,
} from '../../../components/collect-collection-dialog';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { EmptyValue } from '../../../components/empty-value';
import { LinkedAddressValue } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
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
	trapDisplayName,
} from '../-adult-display';
import { CollectionKeyEntryDialog } from '../-collection-key-entry';
import { formatMonthDay, todayInTimeZone } from '../-overview-data';

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

function RouteComponent() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const snapshot = auth.snapshot?.authenticated === true ? auth.snapshot : null;
	const actorProfileId = snapshot?.localIdentity.profileId ?? null;
	const role = snapshot?.localIdentity.role ?? null;
	const canEdit = snapshot !== null && !(role !== null && READ_ONLY_ROLES.has(role));
	return <CollectionDetail actorProfileId={actorProfileId} canEdit={canEdit} collectionId={id} />;
}

function CollectionDetail({
	collectionId,
	actorProfileId,
	canEdit,
}: {
	readonly collectionId: string;
	readonly actorProfileId: string | null;
	readonly canEdit: boolean;
}) {
	const result = useLiveQuery(
		{
			gcTime: collectionGcTimeMs,
			query: (query) =>
				query
					.from({ collection: webCollections.collections })
					.where(({ collection }) => eq(collection.id, collectionId))
					.findOne(),
		},
		[collectionId],
	);
	const collection = result.data as AdultCollectionRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link className={backLink()} to="/adult-surveillance/collections">
					<ArrowLeftIcon aria-hidden="true" />
					Back to collections
				</Link>
				{!result.isReady ? (
					<CollectionDetailSkeleton />
				) : collection === undefined ? (
					<RecordUnavailable noun="collection" reason="not-found" />
				) : (
					<CollectionDetailContent
						actorProfileId={actorProfileId}
						canEdit={canEdit}
						collection={collection}
					/>
				)}
			</div>
		</div>
	);
}

function CollectionDetailContent({
	collection,
	actorProfileId,
	canEdit,
}: {
	readonly collection: AdultCollectionRow;
	readonly actorProfileId: string | null;
	readonly canEdit: boolean;
}) {
	const title = collectionTitle(collection);
	useBreadcrumbLabel(collection.id, title);

	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);

	const methodName =
		methods.find((method) => method.id === collection.collectionMethodId)?.name ?? 'Unknown method';
	const lureName =
		collection.collectionLureId === null
			? null
			: (lures.find((lure) => lure.id === collection.collectionLureId)?.name ?? 'Unknown lure');
	const trap =
		collection.trapId === null ? null : (traps.find((t) => t.id === collection.trapId) ?? null);
	const profileNameById = useMemo(
		() => new Map(profiles.map((profile) => [profile.id, profile.displayName])),
		[profiles],
	);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<CollectionIcon aria-hidden="true" className="size-3.5" />
						Collection
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">{title}</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{trap === null ? 'Ad-hoc collection' : trapDisplayName(trap)} · {methodName}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<CollectionFlagBadges
						className="flex flex-wrap items-center gap-1.5"
						collection={collection}
					/>
					{canEdit && isPendingCollection(collection) ? (
						<WriteOnly>
							<CollectCollectionButton actorProfileId={actorProfileId} collection={collection} />
						</WriteOnly>
					) : null}
					{canEdit ? (
						<WriteOnly>
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: collection.id }} to="/adult-surveillance/collections/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit
								</Link>
							</Button>
						</WriteOnly>
					) : null}
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<CollectionLocationCard collection={collection} />
					<ResultsCard actorProfileId={actorProfileId} canEdit={canEdit} collection={collection} />
					<DangerZoneCard
						name={title}
						noun="collection"
						onDelete={() => webCollections.collections.delete(collection.id)}
						recordId={collection.id}
						recordType="collection"
						returnTo="/adult-surveillance/collections"
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<DetailsCard
						collection={collection}
						lureName={lureName}
						methodName={methodName}
						profileNameById={profileNameById}
						trap={trap}
					/>
					<CustomFieldsCard
						metadata={collection.metadata}
						schema={customSchemaFor(methods, collection.collectionMethodId)}
					/>
					<CommentsSection
						description="Field notes, identification remarks, and follow-up for this collection."
						target={{ type: 'collection', id: collection.id }}
					/>
				</div>
			</div>
		</>
	);
}

/** The second visit, on a trap that is still out. */
function CollectCollectionButton({
	collection,
	actorProfileId,
}: {
	readonly collection: AdultCollectionRow;
	readonly actorProfileId: string | null;
}) {
	const [open, setOpen] = useState(false);
	const { run: runAcknowledged, dialog: acknowledgeDialog } = useAcknowledgedWrite();

	return (
		<>
			<Button onClick={() => setOpen(true)} size="sm" variant="default">
				Collect
			</Button>
			<CollectCollectionDialog
				defaultDate={todayInTimeZone(undefined)}
				onConfirm={(collectedAt) => {
					setOpen(false);
					void runAcknowledged((acknowledgements) =>
						collectPendingCollection({
							acknowledgements,
							actorProfileId,
							collectedAt,
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

function CollectionLocationCard({ collection }: { readonly collection: AdultCollectionRow }) {
	const { lat, lng } = collection;
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

interface SpeciesEntry {
	readonly id: string;
	readonly speciesId: string;
	readonly count: number;
	readonly sex: SpeciesSex | null;
	readonly status: SpeciesStatus | null;
	readonly identifiedByProfileId: string | null;
}

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
	actorProfileId,
	canEdit,
}: {
	readonly collection: AdultCollectionRow;
	readonly actorProfileId: string | null;
	readonly canEdit: boolean;
}) {
	const { rows: speciesRows } = useCollectionRows<SpeciesRow>(webCollections.species);
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

	const result = useLiveQuery(
		{
			gcTime: collectionGcTimeMs,
			query: (query) =>
				query
					.from({ collectionSpecies: webCollections.collectionSpecies })
					.where(({ collectionSpecies }) => eq(collectionSpecies.collectionId, collection.id))
					.orderBy(({ collectionSpecies }) => collectionSpecies.createdAt, 'asc')
					.select(({ collectionSpecies }) => ({
						id: collectionSpecies.id,
						speciesId: collectionSpecies.speciesId,
						count: collectionSpecies.count,
						sex: collectionSpecies.sex,
						status: collectionSpecies.status,
						identifiedByProfileId: collectionSpecies.identifiedByProfileId,
					})),
		},
		[collection.id],
	);
	const entries = (result.data ?? []) as unknown as readonly SpeciesEntry[];
	const total = useMemo(
		() => entries.reduce((sum, entry) => sum + (entry.count ?? 0), 0),
		[entries],
	);

	const [confirmZeroResult, setConfirmZeroResult] = useState(false);
	const [keyEntryOpen, setKeyEntryOpen] = useState(false);

	const setFlag = useCallback(
		(key: 'isZeroResult' | 'hasBycatch' | 'hasProblem', value: boolean) => {
			void webCollections.collections.update(collection.id, (draft) => {
				(draft as { -readonly [K in keyof AdultCollectionRow]: AdultCollectionRow[K] })[key] =
					value;
			});
		},
		[collection.id],
	);

	// Marking a collection zero-result clears every recorded species server-side
	// (see markCollectionZeroResult). Guard the destructive turn-on when specimens
	// exist; turning it off — or on with an already-empty list — applies straight away.
	const handleZeroResultChange = useCallback(
		(value: boolean) => {
			if (value && entries.length > 0) {
				setConfirmZeroResult(true);
				return;
			}
			setFlag('isZeroResult', value);
		},
		[entries.length, setFlag],
	);

	const removeSpecies = (entryId: string) => {
		void webCollections.collectionSpecies.delete(entryId);
	};

	// Inline edits patch a single collection_species field; the mutation handler
	// resends only the changed keys (COLLECTION_SPECIES_PATCH_KEYS).
	const updateSpecies = useCallback(
		(
			entryId: string,
			changes: Partial<Pick<CollectionSpeciesRow, 'speciesId' | 'sex' | 'status' | 'count'>>,
		) => {
			void webCollections.collectionSpecies.update(entryId, (draft) => {
				Object.assign(draft, changes);
			});
		},
		[],
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
						onChange={(value) => setFlag('hasBycatch', value)}
					/>
					<FlagRow
						checked={collection.hasProblem}
						description="Trap failure, tampering, or a compromised sample."
						disabled={!canEdit}
						label="Problem"
						onChange={(value) => setFlag('hasProblem', value)}
					/>
				</div>

				<div className="grid gap-3">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						Species
					</span>
					{result.isError ? (
						<SpeciesEmpty
							description="Species records could not be loaded."
							title="Species Unavailable"
						/>
					) : !result.isReady ? (
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
												onChange={updateSpecies}
												onRemove={removeSpecies}
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
						<AddSpeciesForm
							actorProfileId={actorProfileId}
							collection={collection}
							speciesOptions={speciesOptions}
						/>
					) : null}
				</div>
			</CardContent>

			<CollectionKeyEntryDialog
				actorProfileId={actorProfileId}
				collectionId={collection.id}
				onOpenChange={setKeyEntryOpen}
				open={keyEntryOpen}
				organizationId={collection.organizationId}
			/>

			<AlertDialog onOpenChange={setConfirmZeroResult} open={confirmZeroResult}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Mark as Zero Result?</AlertDialogTitle>
						<AlertDialogDescription>
							This clears the {entries.length} species {entries.length === 1 ? 'record' : 'records'}{' '}
							already recorded for this collection, and can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => setFlag('isZeroResult', true)}>
							Mark Zero Result
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
	readonly entry: SpeciesEntry;
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
	readonly entry: SpeciesEntry;
	readonly speciesOptions: readonly SpeciesOption[];
	readonly onChange: (
		entryId: string,
		changes: Partial<Pick<CollectionSpeciesRow, 'speciesId' | 'sex' | 'status' | 'count'>>,
	) => void;
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
	collection,
	speciesOptions,
	actorProfileId,
}: {
	readonly collection: AdultCollectionRow;
	readonly speciesOptions: readonly SpeciesOption[];
	readonly actorProfileId: string | null;
}) {
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
			const now = new Date().toISOString();
			const row: CollectionSpeciesRow = {
				id: crypto.randomUUID(),
				organizationId: collection.organizationId,
				collectionId: collection.id,
				speciesId: value.speciesId,
				count: Math.trunc(value.count),
				sex: value.sex === 'unset' ? null : value.sex,
				status: value.status === 'unset' ? null : value.status,
				identifiedByProfileId: actorProfileId,
				identifiedDate: todayInTimeZone(undefined),
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};
			void webCollections.collectionSpecies.insert(row);
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
	trap,
	methodName,
	lureName,
	profileNameById,
}: {
	readonly collection: AdultCollectionRow;
	readonly trap: TrapRow | null;
	readonly methodName: string;
	readonly lureName: string | null;
	readonly profileNameById: ReadonlyMap<string, string>;
}) {
	const collectedDate = collectionEffectiveDate(collection);
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Trap">
						{trap === null ? (
							<span className="text-muted-foreground italic">Ad-hoc — no trap</span>
						) : (
							<Link
								className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: trap.id }}
								to="/adult-surveillance/traps/$id"
							>
								<TrapIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
								{trapDisplayName(trap)}
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
							formatMonthDay(collectedDate)
						)}
					</DetailRow>
					<DetailRow label="Set">
						{collection.startedAt === null ? <EmptyValue /> : formatMonthDay(collection.startedAt)}
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
						<LinkedAddressValue addressId={collection.addressId} />
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

function CollectionDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-[360px]" />
					<Skeleton className="h-64" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}
