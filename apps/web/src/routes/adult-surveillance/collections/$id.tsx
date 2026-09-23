import type { SpeciesSex, SpeciesStatus } from '@simmer-mosquito/domain';
import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { customSchemaFor, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
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
import { NumberInput } from '@simmer-mosquito/ui-web/components/ui/number-input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
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
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import {
	CollectionFlagBadges,
	collectionCrumb,
	collectionEffectiveDate,
	collectionTitle,
	isPendingCollection,
	SPECIES_SEX_VALUES,
	SPECIES_STATUS_VALUES,
	SpeciesSexBadge,
	SpeciesStatusBadge,
	speciesSexLabel,
	speciesStatusLabel,
} from '../../../components/adult-surveillance/adult-display';
import { CollectionKeyEntryDialog } from '../../../components/adult-surveillance/collection-key-entry';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CollectCollectionDialog } from '../../../components/collect-collection-dialog';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	DetailPageShell,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useCollectionMutations } from '../../../hooks/mutations/use-collection-mutations';
import {
	type CollectionSpeciesChanges,
	useCollectionSpeciesMutations,
} from '../../../hooks/mutations/use-collection-species-mutations';
import type { AdultCollection } from '../../../hooks/queries/collection-view';
import { activityGcTimeMs } from '../../../hooks/queries/shared';
import { collectionPlaceLabel, trapDisplayName } from '../../../hooks/queries/trap-view';
import { useAdultCollection } from '../../../hooks/queries/use-adult-collection';
import {
	type CollectionIdentification,
	useCollectionIdentifications,
} from '../../../hooks/queries/use-collection-identifications';
import { useCollectionMethodRoster } from '../../../hooks/queries/use-collection-method-roster';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useSpeciesCatalog } from '../../../hooks/queries/use-species-catalog';
import { type AskAcknowledged, useAcknowledgedWrite } from '../../../hooks/use-acknowledged-write';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import {
	COLLECTION_DELETE_REFUSALS,
	COLLECTION_ZERO_RESULT_REFUSALS,
} from '../../../lib/acknowledgement-copy';
import {
	formatWeekdayMonthDay,
	operationalDayAsTimestamp,
	todayInTimeZone,
} from '../../../lib/local-date';

export const Route = createFileRoute('/adult-surveillance/collections/$id')({
	component: RouteComponent,
});

const CollectionIcon = iconRegistry.entities.collection.icon;
const CollectIcon = iconRegistry.actions.select.icon;
// Identification is about the mosquitoes in the sample, not the taxonomy tree the
// names come from — the same mark heads the card on larval samples.
const SpeciesIcon = iconRegistry.simmer.mosquito.icon;
const TrapIcon = iconRegistry.entities.trap.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

// Roles that get a read-only view of a collection — no flag toggles, species
// edits, or additions (mirrors the comments thread's read-only gate).
const READ_ONLY_ROLES = new Set(['viewer']);

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { main: [['h-[360px]', 'h-64'], 'h-64'], aside: ['h-72'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const snapshot = auth.snapshot?.authenticated === true ? auth.snapshot : null;
	const role = snapshot?.localIdentity.role ?? null;
	const canEdit = snapshot !== null && !(role !== null && READ_ONLY_ROLES.has(role));
	const { collection, isReady, isError } = useAdultCollection(id, { gcTime: activityGcTimeMs });

	return (
		<RecordDetailPage
			deleteRefusals={COLLECTION_DELETE_REFUSALS}
			layout={layout}
			recordType="collection"
			reading={{ isError, isReady, record: collection }}
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
	useBreadcrumbLabel(collection.id, collectionCrumb(collection, titleTimeZone));

	// The method roster is still read, because the custom-field schema hangs off
	// the collection method and a schema is not something a `select` can join. The
	// trap, the method name and the lure name are joined by the read seam now —
	// three lookups against three rosters gone, and with them the chance of an id
	// resolving to nothing because its roster had not streamed yet.
	const methods = useCollectionMethodRoster();
	const profiles = useProfileRoster();
	const mutations = useCollectionMutations();
	const [collectOpen, setCollectOpen] = useState(false);

	const { methodName } = collection;
	// Guarded on the collection's own column rather than the joined name: a
	// collection set without a lure reads as no lure, while one whose lure has
	// since been deleted reads as an unknown one, and collapsing those would
	// quietly turn a deleted catalog row into a blank.
	const lureName = collection.lureId === null ? null : (collection.lureName ?? 'Unknown lure');
	const profileNameById = new Map(profiles.map((profile) => [profile.id, profile.displayName]));

	return (
		<DetailPageShell
			aside={
				<CommentsSection
					description="Field notes, identification remarks, and follow-up for this collection."
					target={{ type: 'collection', id: collection.id }}
				/>
			}
			facts={
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
				</>
			}
			header={{
				...(canEdit
					? {
							edit: {
								params: { id: collection.id },
								to: '/adult-surveillance/collections/$id/edit' as const,
							},
						}
					: {}),
				actions: [
					{
						hidden: !canEdit || !isPendingCollection(collection),
						icon: CollectIcon,
						id: 'collect',
						label: 'Collect',
						onSelect: () => setCollectOpen(true),
					},
				],
				flags: (
					<CollectionFlagBadges
						className="flex flex-wrap items-center gap-1.5"
						collection={collection}
					/>
				),
				icon: CollectionIcon,
				recordType: 'collection',
				remove: {
					ask: askDelete,
					name: title,
					onDelete: (acknowledgements) => mutations.remove(collection.id, acknowledgements),
					recordId: collection.id,
					returnTo: '/adult-surveillance/collections',
				},
				subtitle: `${collectionPlaceLabel(collection)} · ${methodName}`,
				title,
			}}
			layout={layout}
			lead={
				<div className="grid content-start gap-3">
					<CollectionLocationCard collection={collection} />
					<RecordRegionsBand recordId={collection.id} recordType="collections" />
				</div>
			}
		>
			<ResultsCard canEdit={canEdit} collection={collection} />
			<CollectCollectionDialogHost
				collection={collection}
				onOpenChange={setCollectOpen}
				open={collectOpen}
			/>
		</DetailPageShell>
	);
}

/**
 * The second visit, on a trap that is still out.
 *
 * Open state is the page's rather than this component's, because the control
 * that starts it is a `...` menu item and a menu unmounts its items the moment
 * one is chosen. A dialog owned by the thing that opens it would be torn down
 * on the same click that asked for it.
 */
function CollectCollectionDialogHost({
	collection,
	onOpenChange,
	open,
}: {
	readonly collection: AdultCollection;
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
}) {
	const { run: runAcknowledged, dialog: acknowledgeDialog } = useAcknowledgedWrite();
	const timeZone = useOrganizationTimeZone();
	const { collect } = useCollectionMutations();

	return (
		<>
			<CollectCollectionDialog
				defaultDate={todayInTimeZone(timeZone)}
				onConfirm={(collectedAt) => {
					onOpenChange(false);
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
				onOpenChange={onOpenChange}
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
			geojson={{ type: 'Point', coordinates: [lng, lat] }}
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
	const species = [...speciesRows].sort((a, b) => a.displayName.localeCompare(b.displayName));
	const speciesOptions = species.map((row) => ({ value: row.id, label: row.displayName }));
	const speciesNameById = new Map(species.map((row) => [row.id, row.displayName]));

	const {
		identifications: entries,
		isReady,
		isError,
	} = useCollectionIdentifications(collection.id);
	const total = entries.reduce((sum, entry) => sum + (entry.count ?? 0), 0);

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
	const handleZeroResultChange = (value: boolean) => {
		void run((acknowledgements) => setZeroResult(collection.id, value, acknowledgements));
	};

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
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
								{total.toLocaleString('en-US')} specimens
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
					{/* Zero result goes through `instead` rather than through `empty`: it is
					    the record answering for its own species, so it outranks the count
					    and stands even while a species row that is on its way out is still
					    in hand. */}
					<PanelRows
						empty={{
							description: canEdit
								? 'No species recorded yet. Add the specimens identified below.'
								: 'No species have been recorded for this collection.',
							title: 'No Species Recorded',
						}}
						icon={<SpeciesIcon aria-hidden="true" />}
						instead={
							collection.isZeroResult
								? {
										description:
											'This collection is marked as a zero result. Turn off “Zero result” to record species.',
										title: 'Zero Result',
									}
								: undefined
						}
						reading={{ isError, isReady, rows: entries }}
						unavailable={{
							description: 'Species records could not be loaded.',
							title: 'Species Unavailable',
						}}
						wrap="none"
					>
						{(rows) => (
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
										{rows.map((entry) =>
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
					</PanelRows>

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
				{entry.sex === null ? <AbsentValue /> : <SpeciesSexBadge sex={entry.sex} />}
			</TableCell>
			<TableCell>
				{entry.status === null ? <AbsentValue /> : <SpeciesStatusBadge status={entry.status} />}
			</TableCell>
			{/* The column header already says Count, so the number stands on its own. */}
			<TableCell className="text-right font-medium tabular-nums">
				{entry.count.toLocaleString('en-US')}
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
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<DetailList>
					<DetailRow label="Trap">
						{collection.trapId === null ? null : (
							<Link
								className={cn(recordLink(), 'inline-flex items-center gap-1.5')}
								params={{ id: collection.trapId }}
								to="/adult-surveillance/traps/$id"
							>
								<TrapIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
								{/*
								 * The id is the trap's, not the collection's. This row is
								 * inside the link to the trap, and `trapDisplayName` falls
								 * back to the head of whatever id it is handed, so passing
								 * the collection drew `Trap <collection id>` for a trap with
								 * no code and no name.
								 */}
								{trapDisplayName({
									id: collection.trapId,
									trapName: collection.trapName,
									trapCode: collection.trapCode,
								})}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Lure">{lureName}</DetailRow>
					<DetailRow label="Collected">
						{collectedDate === null ? null : formatWeekdayMonthDay(collectedDate)}
					</DetailRow>
					<DetailRow label="Set">
						{startedDay === null ? null : formatWeekdayMonthDay(startedDay)}
					</DetailRow>
					<DetailRow label="Collected by">
						{collection.collectedByProfileId === null
							? null
							: (profileNameById.get(collection.collectedByProfileId) ?? 'Unknown')}
					</DetailRow>
					<DetailRow label="Set by">
						{collection.setByProfileId === null
							? null
							: (profileNameById.get(collection.setByProfileId) ?? 'Unknown')}
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={collection.addressId} />
					</DetailRow>
				</DetailList>
				<AdditionalPersonnelList target={{ type: 'collection', id: collection.id }} />
			</CardContent>
		</Card>
	);
}

// --- states + helpers --------------------------------------------------------
