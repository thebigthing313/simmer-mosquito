import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { Sample } from '@simmer-mosquito/sync';
import { sessionFetch } from '@simmer-mosquito/sync';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
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
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NumberInput } from '@simmer-mosquito/ui-web/components/ui/number-input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	ArrowLeftIcon,
	CalendarIcon,
	iconRegistry,
	KeyboardIcon,
	Loader2Icon,
	PlusIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { useSpeciesOptions as useAdoptedSpeciesOptions } from '../../../components/explorer';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordUnavailable } from '../../../components/record';
import { useSampleMutations } from '../../../hooks/mutations/use-sample-mutations';
import {
	type SampleSpeciesFields,
	useSampleSpeciesMutations,
} from '../../../hooks/mutations/use-sample-species-mutations';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { sample_species } from '../../../lib/collections/sample_species';
import { samples } from '../../../lib/collections/samples';
import { adhocLabel, formatCoordinates } from '../../../lib/coordinate-label';
import { todayInTimeZone } from '../-overview-data';
import { SampleKeyEntryDialog } from '../-sample-key-entry';

export const Route = createFileRoute('/larval-surveillance/samples/$id')({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <SampleDetail sampleId={id} />;
}

const SampleIcon = iconRegistry.entities.sample.icon;
// Identification is about the mosquitoes in the sample, not the taxonomy tree the
// names come from — the same mark heads the card on adult collections.
const SpeciesIcon = iconRegistry.simmer.mosquito.icon;
const InspectionIcon = iconRegistry.entities.inspection.icon;
const HabitatIcon = iconRegistry.simmer.fieldWork.icon;

// The sample record + its species rows stream from on-demand collections; keep the
// subset warm briefly after unmount so returning to the page reuses it.
const sampleRecordGcTimeMs = 30_000;

/**
 * One identification as this page holds it.
 *
 * The same four fields `useSampleSpeciesMutations` compares against, plus the
 * id — so a count correction can be handed straight to `save` without the page
 * rebuilding the current values from somewhere else.
 */
interface SampleSpeciesEntry extends SampleSpeciesFields {
	readonly id: string;
}

/**
 * The four disposition writes, named.
 *
 * A record of callbacks rather than one `onPatch` taking a draft mutator: each
 * of these is a different domain command, and the control that fires it is the
 * only thing that knows which.
 */
interface SampleDisposition {
	readonly setZeroLarvae: (next: boolean) => Promise<void>;
	readonly setNonMosquito: (next: boolean) => Promise<void>;
	readonly setUnidentifiableReason: (next: string) => Promise<void>;
	readonly rename: (next: string) => Promise<void>;
}

// Roles that may read but not manage sample results — they get a read-only view.
const readOnlyRoles = new Set(['viewer']);

type SampleStatus = 'identified' | 'awaiting' | 'zero_larvae' | 'unidentifiable';

interface StatusMeta {
	readonly label: string;
	readonly tone: 'success' | 'info' | 'neutral' | 'warning';
	readonly description: string;
}

const STATUS_META: Record<SampleStatus, StatusMeta> = {
	identified: {
		label: 'Identified',
		tone: 'success',
		description: 'One or more species have been identified in this sample.',
	},
	awaiting: {
		label: 'Awaiting ID',
		tone: 'info',
		description: 'This sample is collected but not yet identified.',
	},
	zero_larvae: {
		label: 'No larvae',
		tone: 'neutral',
		description: 'The sample was examined and held no mosquito larvae.',
	},
	unidentifiable: {
		label: 'Unidentifiable',
		tone: 'warning',
		description: 'The specimens could not be identified to species.',
	},
};

/**
 * The `/map/samples/:id` projection: the sample's own fields plus the parent
 * inspection's owned geometry and habitat labels. This is the single source for the
 * header, map, and context — the editable result fields (species counts, disposition
 * flags) are read back from the synced collections so optimistic edits reflect live.
 */
interface SampleGeoRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geojson: GeoJsonGeometry | null;
	readonly geomType: string | null;
	readonly displayName: string | null;
	readonly inspectionId: string;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly createdByProfileId: string | null;
	readonly status: SampleStatus;
	readonly identifiedAt: string | null;
	readonly larvaeTotal: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}

function SampleDetail({ sampleId }: { readonly sampleId: string }) {
	const query = useSampleGeoContext(sampleId);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'trailing' })}>
				<SampleTopBar
					habitatId={query.data?.habitatId ?? null}
					inspectionId={query.data?.inspectionId ?? null}
				/>
				{query.isPending ? (
					<SampleDetailSkeleton />
				) : query.isError || query.data == null ? (
					<RecordUnavailable noun="sample" reason="not-found" />
				) : (
					<SampleDetailContent geo={query.data} />
				)}
			</div>
		</div>
	);
}

function SampleTopBar({
	habitatId,
	inspectionId,
}: {
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<Link
				className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
				to="/larval-surveillance/samples"
			>
				<ArrowLeftIcon aria-hidden="true" />
				Back to samples
			</Link>
			<div className="flex flex-wrap items-center gap-2">
				{inspectionId === null ? null : (
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: inspectionId }} to="/larval-surveillance/inspections/$id">
							<InspectionIcon aria-hidden="true" />
							View inspection
						</Link>
					</Button>
				)}
				{habitatId === null ? null : (
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: habitatId }} to="/larval-surveillance/habitats/$id">
							<HabitatIcon aria-hidden="true" />
							View habitat
						</Link>
					</Button>
				)}
			</div>
		</div>
	);
}

function SampleDetailContent({ geo }: { readonly geo: SampleGeoRow }) {
	useBreadcrumbLabel(geo.id, breadcrumbLabel(geo));

	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const canManage =
		identity?.profileId != null &&
		identity.organizationId != null &&
		!(identity.role !== null && readOnlyRoles.has(identity.role));
	const sampleMutations = useSampleMutations();

	return (
		<>
			<SampleHeader canManage={canManage} geo={geo} />
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<SampleLocationCard geometry={geo.geojson} geomType={geo.geomType} />
					<IdentificationCard
						canManage={canManage}
						identity={identity}
						sampleId={geo.id}
						seed={geo}
					/>
					<DangerZoneCard
						name={breadcrumbLabel(geo)}
						noun="sample"
						onDelete={() => sampleMutations.remove(geo.id)}
						recordId={geo.id}
						recordType="sample"
						returnTo="/larval-surveillance/samples"
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<ContextCard geo={geo} />
					<CommentsSection
						description="Lab notes, identification context, and follow-up for this sample."
						target={{ type: 'sample', id: geo.id }}
					/>
				</div>
			</div>
		</>
	);
}

function SampleHeader({
	geo,
	canManage,
}: {
	readonly geo: SampleGeoRow;
	readonly canManage: boolean;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid gap-1.5">
				<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
					<SampleIcon aria-hidden="true" className="size-3.5" />
					Larval sample
				</span>
				<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
					{sampleName(geo)}
				</h1>
				<p className="m-0 inline-flex flex-wrap items-center gap-1.5 text-[0.95rem] text-muted-foreground">
					<CalendarIcon aria-hidden="true" className="size-4" />
					<span>Collected {formatFullDate(geo.inspectionDate)}</span>
					{geo.habitatId === null ? (
						<>
							<span aria-hidden="true">·</span>
							<span className="tabular-nums">{adhocLabel(geo.lat, geo.lng)}</span>
						</>
					) : (
						<>
							<span aria-hidden="true">·</span>
							<span>at</span>
							<Link
								className="rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
								params={{ id: geo.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								{habitatLabel(geo)}
							</Link>
						</>
					)}
				</p>
			</div>
			<AccessBadge canManage={canManage} />
		</div>
	);
}

function AccessBadge({ canManage }: { readonly canManage: boolean }) {
	return (
		<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
			{canManage ? 'Editor access' : 'View only'}
		</Badge>
	);
}

// --- location ---------------------------------------------------------------

function SampleLocationCard({
	geometry,
	geomType,
}: {
	readonly geometry: GeoJsonGeometry | null;
	readonly geomType: string | null;
}) {
	return (
		<RecordLocationCard
			emptyDescription="The parent inspection has no location to display."
			geojson={geometry}
			geomType={geomType}
			height="h-[240px]"
		/>
	);
}

// --- identification form (the "manage sample results" surface) --------------

interface Identity {
	readonly organizationId: string | null;
	readonly profileId: string | null;
	readonly role: string | null;
}

/**
 * The core of the page: the editable identification result. Reads the live sample
 * record and its species rows from the on-demand collections (so optimistic edits
 * reflect immediately), derives the resolved lifecycle status the same way the
 * server does, and dispatches add / edit / remove through the sample and
 * sample-species optimistic mutation handlers. Every write is gated on
 * {@link canManage}; a viewer gets the same layout read-only.
 */
function IdentificationCard({
	sampleId,
	seed,
	canManage,
	identity,
}: {
	readonly sampleId: string;
	readonly seed: SampleGeoRow;
	readonly canManage: boolean;
	readonly identity: Identity | null;
}) {
	const [error, setError] = useState<string | null>(null);
	const [keyEntryOpen, setKeyEntryOpen] = useState(false);
	const sampleMutations = useSampleMutations();
	const speciesMutations = useSampleSpeciesMutations();

	// The on-demand sample record — the source of truth for the disposition flags
	// and label. Falls back to the one-shot seed until the subset is ready.
	const recordResult = useLiveQuery(
		{
			gcTime: sampleRecordGcTimeMs,
			query: (query) =>
				query.from({ sample: samples }).where(({ sample }) => eq(sample.id, sampleId)),
		},
		[sampleId],
	);
	const speciesResult = useLiveQuery(
		{
			gcTime: sampleRecordGcTimeMs,
			query: (query) =>
				query
					.from({ sampleSpecies: sample_species })
					.where(({ sampleSpecies }) => eq(sampleSpecies.sample_id, sampleId))
					.orderBy(({ sampleSpecies }) => sampleSpecies.larvae_count, 'desc')
					.select(({ sampleSpecies }) => ({
						id: sampleSpecies.id,
						speciesId: sampleSpecies.species_id,
						larvaeCount: sampleSpecies.larvae_count,
						identifiedByProfileId: sampleSpecies.identified_by_profile_id,
						identifiedAt: sampleSpecies.identified_at,
					})),
		},
		[sampleId],
	);

	const record = (recordResult.data ?? [])[0] as Sample | undefined;
	const speciesRows = (speciesResult.data ?? []) as readonly SampleSpeciesEntry[];
	const isReady = recordResult.isReady && speciesResult.isReady;
	const isError = recordResult.isError || speciesResult.isError;

	const { nameById, options } = useSpeciesCatalog();

	// Prefer the live record; fall back to the fetched seed while the subset loads.
	const isZeroLarvae = record?.is_zero_larvae ?? seed.isZeroLarvae;
	const hasNonMosquito = record?.has_non_mosquito ?? seed.hasNonMosquito;
	const unidentifiableReason = record?.unidentifiable_reason ?? seed.unidentifiableReason;
	const displayName = record?.display_name ?? seed.displayName;

	const status = resolveStatus({
		hasSpecies: speciesRows.length > 0,
		isZeroLarvae,
		unidentifiableReason,
	});
	const larvaeTotal = speciesRows.reduce((sum, row) => sum + row.larvaeCount, 0);
	const meta = STATUS_META[status];

	const takenSpeciesIds = useMemo(
		() => new Set(speciesRows.map((row) => row.speciesId)),
		[speciesRows],
	);

	const timeZone = useOrganizationTimeZone();

	const guard = useCallback((): boolean => {
		if (!canManage || identity?.organizationId == null) {
			setError('You do not have permission to manage this sample.');
			return false;
		}
		return true;
	}, [canManage, identity]);

	const handleAddSpecies = useCallback(
		async (speciesId: string, larvaeCount: number) => {
			if (!guard()) {
				return;
			}
			setError(null);
			try {
				await speciesMutations.add({
					sampleSpeciesId: crypto.randomUUID(),
					sampleId,
					fields: {
						speciesId,
						larvaeCount,
						identifiedByProfileId: identity?.profileId ?? null,
						// A calendar date, not a timestamp — the domain builder validates
						// identifiedAt against YYYY-MM-DD and rejects a full ISO string.
						identifiedAt: todayInTimeZone(timeZone),
					},
				});
			} catch (cause) {
				setError(messageOf(cause, 'Unable to add species.'));
			}
		},
		[guard, identity, sampleId, timeZone, speciesMutations],
	);

	const handleUpdateCount = useCallback(
		async (rowId: string, larvaeCount: number) => {
			if (!guard()) {
				return;
			}
			setError(null);
			const current = speciesRows.find((row) => row.id === rowId);
			if (current === undefined) {
				return;
			}
			try {
				await speciesMutations.save(rowId, { ...current, larvaeCount }, current);
			} catch (cause) {
				setError(messageOf(cause, 'Unable to update count.'));
			}
		},
		[guard, speciesRows, speciesMutations],
	);

	const handleRemoveSpecies = useCallback(
		async (rowId: string) => {
			if (!guard()) {
				return;
			}
			setError(null);
			try {
				await speciesMutations.remove(rowId);
			} catch (cause) {
				setError(messageOf(cause, 'Unable to remove species.'));
			}
		},
		[guard, speciesMutations],
	);

	/**
	 * The four disposition writes, each naming its own command.
	 *
	 * They were one `onPatch(draft => …)` that mutated whichever field the
	 * control touched and let the server work out what was meant — the inference
	 * this migration removes. Zero-larvae is two commands because which way it
	 * moved is the point; the other three are one each.
	 */
	const runPatch = useCallback(
		async (write: () => Promise<void>, fallback: string) => {
			if (!guard()) {
				return;
			}
			setError(null);
			try {
				await write();
			} catch (cause) {
				setError(messageOf(cause, fallback));
			}
		},
		[guard],
	);

	const disposition = useMemo(
		() => ({
			setZeroLarvae: (next: boolean) =>
				runPatch(
					() => sampleMutations.setZeroLarvae(sampleId, next),
					'Unable to update the sample.',
				),
			setNonMosquito: (next: boolean) =>
				runPatch(
					() => sampleMutations.setNonMosquito(sampleId, next),
					'Unable to update the sample.',
				),
			setUnidentifiableReason: (next: string) =>
				runPatch(
					() => sampleMutations.setUnidentifiableReason(sampleId, next === '' ? null : next),
					'Unable to update the sample.',
				),
			rename: (next: string) =>
				runPatch(() => sampleMutations.rename(sampleId, next), 'Unable to update the sample.'),
		}),
		[runPatch, sampleMutations, sampleId],
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
						<CardDescription>{meta.description}</CardDescription>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Badge tone={meta.tone} variant="outline">
							{meta.label}
						</Badge>
						{canManage ? (
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
			<CardContent className="grid gap-5" padding="compact">
				{error !== null ? (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}

				{isError ? (
					<ResultsUnavailable />
				) : !isReady ? (
					<div className="grid gap-2">
						{[0, 1].map((index) => (
							<Skeleton className="h-12 w-full" key={index} />
						))}
					</div>
				) : (
					<>
						<SpeciesResultList
							canManage={canManage}
							nameById={nameById}
							onRemove={handleRemoveSpecies}
							onUpdateCount={handleUpdateCount}
							rows={speciesRows}
							total={larvaeTotal}
						/>

						{canManage ? (
							<AddSpeciesRow
								onAdd={handleAddSpecies}
								options={options}
								takenSpeciesIds={takenSpeciesIds}
							/>
						) : null}

						<DispositionSection
							canManage={canManage}
							displayName={displayName}
							hasNonMosquito={hasNonMosquito}
							hasSpecies={speciesRows.length > 0}
							isZeroLarvae={isZeroLarvae}
							disposition={disposition}
							unidentifiableReason={unidentifiableReason}
						/>
					</>
				)}
			</CardContent>

			{identity?.organizationId == null ? null : (
				<SampleKeyEntryDialog
					actorProfileId={identity.profileId}
					onOpenChange={setKeyEntryOpen}
					open={keyEntryOpen}
					sampleId={sampleId}
				/>
			)}
		</Card>
	);
}

function SpeciesResultList({
	rows,
	total,
	nameById,
	canManage,
	onUpdateCount,
	onRemove,
}: {
	readonly rows: readonly SampleSpeciesEntry[];
	readonly total: number;
	readonly nameById: ReadonlyMap<string, string>;
	readonly canManage: boolean;
	readonly onUpdateCount: (rowId: string, count: number) => Promise<void>;
	readonly onRemove: (rowId: string) => Promise<void>;
}) {
	if (rows.length === 0) {
		return (
			<div className="grid gap-1.5">
				<SectionLabel>Identified species</SectionLabel>
				<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-4 text-muted-foreground text-sm">
					No species identified yet.
					{canManage ? ' Add one below, or mark the sample’s disposition.' : ''}
				</p>
			</div>
		);
	}

	return (
		<div className="grid gap-1.5">
			<div className="flex items-baseline justify-between gap-3">
				<SectionLabel>Identified species</SectionLabel>
				<span className="text-muted-foreground text-xs">{total.toLocaleString()} larvae total</span>
			</div>
			<ul className="grid gap-2">
				{rows.map((row) => (
					<SpeciesResultRow
						canManage={canManage}
						key={row.id}
						name={nameById.get(row.speciesId) ?? 'Unknown species'}
						onRemove={onRemove}
						onUpdateCount={onUpdateCount}
						row={row}
					/>
				))}
			</ul>
		</div>
	);
}

function SpeciesResultRow({
	row,
	name,
	canManage,
	onUpdateCount,
	onRemove,
}: {
	readonly row: SampleSpeciesEntry;
	readonly name: string;
	readonly canManage: boolean;
	readonly onUpdateCount: (rowId: string, count: number) => Promise<void>;
	readonly onRemove: (rowId: string) => Promise<void>;
}) {
	const [draft, setDraft] = useState<number | null>(row.larvaeCount);
	const [busy, setBusy] = useState(false);

	// Keep the input in sync when the persisted value changes out from under us.
	useEffect(() => {
		setDraft(row.larvaeCount);
	}, [row.larvaeCount]);

	// Commits on blur, Enter, and stepper click; a blank or negative entry reverts to
	// the stored count rather than writing a value the server would reject.
	const commit = async (next: number | null) => {
		if (next === null || !Number.isFinite(next) || next < 0) {
			setDraft(row.larvaeCount);
			return;
		}
		const resolved = Math.trunc(next);
		setDraft(resolved);
		if (resolved === row.larvaeCount) {
			return;
		}
		setBusy(true);
		try {
			await onUpdateCount(row.id, resolved);
		} finally {
			setBusy(false);
		}
	};

	const remove = async () => {
		setBusy(true);
		try {
			await onRemove(row.id);
		} finally {
			setBusy(false);
		}
	};

	return (
		<li className="flex items-center gap-2 rounded-md border border-border/40 bg-background/60 px-3 py-2">
			<SpeciesIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm italic">
				{name}
			</span>
			{canManage ? (
				<>
					<NumberInput
						aria-label={`Larvae count for ${name}`}
						className="w-28"
						disabled={busy}
						min={0}
						onCommit={(next) => void commit(next)}
						onValueChange={setDraft}
						value={draft}
					/>
					<Button
						aria-label={`Remove ${name}`}
						disabled={busy}
						onClick={() => void remove()}
						size="icon-xs"
						title="Remove Species"
						variant="ghost"
					>
						<XIcon aria-hidden="true" />
					</Button>
				</>
			) : (
				<Badge tone="success" variant="outline">
					<span className="tabular-nums">{row.larvaeCount.toLocaleString()}</span> larvae
				</Badge>
			)}
		</li>
	);
}

function AddSpeciesRow({
	options,
	takenSpeciesIds,
	onAdd,
}: {
	readonly options: readonly SpeciesOption[];
	readonly takenSpeciesIds: ReadonlySet<string>;
	readonly onAdd: (speciesId: string, count: number) => Promise<void>;
}) {
	const [speciesId, setSpeciesId] = useState<string | null>(null);
	const [count, setCount] = useState<number | null>(1);
	const [busy, setBusy] = useState(false);

	// `sample_species` holds one row per species, so anything already identified is
	// edited in the list above rather than offered again here.
	const available = useMemo(
		() =>
			options
				.filter((option) => !takenSpeciesIds.has(option.id))
				.map((option) => ({ value: option.id, label: option.label })),
		[options, takenSpeciesIds],
	);

	const canAdd =
		speciesId !== null && count !== null && Number.isFinite(count) && count >= 0 && !busy;

	const submit = async () => {
		if (speciesId === null || count === null || !Number.isFinite(count) || count < 0 || busy) {
			return;
		}
		setBusy(true);
		try {
			await onAdd(speciesId, Math.trunc(count));
			setSpeciesId(null);
			setCount(1);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="grid gap-1.5">
			<SectionLabel>Add species</SectionLabel>
			<div className="flex flex-wrap items-center gap-2">
				<div className="min-w-48 flex-1">
					<Autocomplete
						aria-label="Choose species"
						onValueChange={setSpeciesId}
						options={available}
						placeholder="Search species…"
						renderOption={renderSpeciesOption}
						renderSelectedValue={renderSpeciesOption}
						value={speciesId}
					/>
				</div>
				<NumberInput
					aria-label="Larvae count"
					className="w-28"
					min={0}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && canAdd) {
							event.preventDefault();
							void submit();
						}
					}}
					onValueChange={setCount}
					placeholder="Count"
					value={count}
				/>
				<Button disabled={!canAdd} onClick={() => void submit()} size="sm" type="button">
					{busy ? (
						<Loader2Icon aria-hidden="true" className="animate-spin" />
					) : (
						<PlusIcon aria-hidden="true" />
					)}
					Add
				</Button>
			</div>
		</div>
	);
}

function DispositionSection({
	isZeroLarvae,
	hasNonMosquito,
	unidentifiableReason,
	displayName,
	hasSpecies,
	canManage,
	disposition,
}: {
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly displayName: string | null;
	readonly hasSpecies: boolean;
	readonly canManage: boolean;
	readonly disposition: SampleDisposition;
}) {
	return (
		<div className="grid gap-3 border-border/50 border-t pt-4">
			<SectionLabel>Disposition</SectionLabel>

			{hasSpecies ? (
				<p className="m-0 text-muted-foreground text-xs">
					A sample with identified species always reads as <em>Identified</em>, regardless of the
					flags below.
				</p>
			) : null}

			<SwitchRow
				checked={isZeroLarvae}
				description="Examined and held no mosquito larvae."
				disabled={!canManage || hasSpecies}
				label="No larvae found"
				onCheckedChange={(next) => void disposition.setZeroLarvae(next)}
			/>
			<SwitchRow
				checked={hasNonMosquito}
				description="Contains non-mosquito organisms or debris."
				disabled={!canManage}
				label="Non-mosquito material"
				onCheckedChange={(next) => void disposition.setNonMosquito(next)}
			/>

			<TextPatchField
				canManage={canManage}
				description="Note why the specimens could not be identified. Clearing it removes the flag."
				label="Unidentifiable reason"
				onCommit={(value) => disposition.setUnidentifiableReason(value)}
				placeholder="e.g. specimens too damaged to key out"
				value={unidentifiableReason ?? ''}
			/>

			<TextPatchField
				canManage={canManage}
				description="An optional label to identify this sample in lists."
				label="Sample label"
				onCommit={(value) => disposition.rename(value)}
				placeholder="e.g. North culvert, jar 3"
				value={displayName ?? ''}
			/>
		</div>
	);
}

function SwitchRow({
	label,
	description,
	checked,
	disabled,
	onCheckedChange,
}: {
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly disabled: boolean;
	readonly onCheckedChange: (next: boolean) => void;
}) {
	// Radix Switch renders a button, not a native input, so associate the text via
	// aria-labelledby rather than nesting the control in a <label>.
	const labelId = `switch-${useId()}`;
	return (
		<div className="flex items-start justify-between gap-3">
			<span className="grid gap-0.5" id={labelId}>
				<span className="font-medium text-foreground text-sm">{label}</span>
				<span className="text-muted-foreground text-xs">{description}</span>
			</span>
			<Switch
				aria-labelledby={labelId}
				checked={checked}
				className="mt-0.5"
				disabled={disabled}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}

function TextPatchField({
	label,
	description,
	value,
	placeholder,
	canManage,
	onCommit,
}: {
	readonly label: string;
	readonly description: string;
	readonly value: string;
	readonly placeholder: string;
	readonly canManage: boolean;
	readonly onCommit: (value: string) => Promise<void>;
}) {
	const [draft, setDraft] = useState(value);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setDraft(value);
	}, [value]);

	const commit = async () => {
		const next = draft.trim();
		if (next === value.trim()) {
			setDraft(value);
			return;
		}
		setBusy(true);
		try {
			await onCommit(next);
		} finally {
			setBusy(false);
		}
	};

	if (!canManage) {
		if (value.trim().length === 0) {
			return null;
		}
		return (
			<div className="grid gap-1">
				<SectionLabel>{label}</SectionLabel>
				<p className="m-0 text-foreground text-sm">{value}</p>
			</div>
		);
	}

	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">{label}</span>
			<Input
				aria-label={label}
				disabled={busy}
				onBlur={() => void commit()}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void commit();
					}
				}}
				placeholder={placeholder}
				value={draft}
			/>
			<span className="text-muted-foreground text-xs">{description}</span>
		</div>
	);
}

// --- context ----------------------------------------------------------------

function ContextCard({ geo }: { readonly geo: SampleGeoRow }) {
	const timeZone = useOrganizationTimeZone();
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Inspection">
						<Link
							className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
							params={{ id: geo.inspectionId }}
							to="/larval-surveillance/inspections/$id"
						>
							<InspectionIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
							{formatMonthDayYear(geo.inspectionDate)}
						</Link>
					</DetailRow>
					<DetailRow label="Habitat">
						{geo.habitatId === null ? (
							<span className="tabular-nums">{adhocLabel(geo.lat, geo.lng)}</span>
						) : (
							<Link
								className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
								params={{ id: geo.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								<HabitatIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
								{habitatLabel(geo)}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Collected">{formatFullDate(geo.inspectionDate)}</DetailRow>
					<DetailRow label="Coordinates">{coordinateLabel(geo)}</DetailRow>
					<DetailRow label="Recorded">{formatDateTime(geo.createdAt, timeZone)}</DetailRow>
					<DetailRow label="Updated">{formatDateTime(geo.updatedAt, timeZone)}</DetailRow>
				</dl>
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[100px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function SectionLabel({ children }: { readonly children: ReactNode }) {
	return (
		<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
			{children}
		</span>
	);
}

// --- species catalog --------------------------------------------------------

interface SpeciesOption {
	readonly id: string;
	readonly label: string;
}

/** Species names are binomials, so they read italic wherever they appear. */
function renderSpeciesOption(option: { readonly label: string }) {
	return <span className="italic">{option.label}</span>;
}

/**
 * Species names + the org's species options for the add-species picker. Names
 * resolve from the eager global taxonomy; the picker offers only the species the
 * org has adopted (falling back to the full catalog if none are curated). Plain
 * (non-suspense) live queries over eager baseline collections.
 */
function useSpeciesCatalog(): {
	readonly nameById: ReadonlyMap<string, string>;
	readonly options: readonly SpeciesOption[];
} {
	return useAdoptedSpeciesOptions();
}

// --- data hook --------------------------------------------------------------

function useSampleGeoContext(id: string) {
	return useQuery({
		queryKey: ['sample-detail', id],
		queryFn: ({ signal }) => fetchSampleGeoContext(id, signal),
		placeholderData: (previous) => previous,
	});
}

async function fetchSampleGeoContext(
	id: string,
	signal: AbortSignal,
): Promise<SampleGeoRow | null> {
	const response = await sessionFetch(new URL(`/map/samples/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Sample request failed (${response.status}).`);
	}
	const body = (await response.json()) as { readonly sample?: SampleGeoRow };
	return body.sample ?? null;
}

// --- presentational states --------------------------------------------------

function ResultsUnavailable() {
	return (
		<Empty className="min-h-[140px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SpeciesIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>Results Unavailable</EmptyTitle>
				<EmptyDescription>
					The sample’s identification could not be loaded. Try again shortly.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function SampleDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-48" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-[320px]" />
					<Skeleton className="h-64" />
				</div>
				<Skeleton className="h-96" />
			</div>
		</>
	);
}

// --- helpers ----------------------------------------------------------------

function resolveStatus(input: {
	readonly hasSpecies: boolean;
	readonly isZeroLarvae: boolean;
	readonly unidentifiableReason: string | null;
}): SampleStatus {
	if (input.hasSpecies) {
		return 'identified';
	}
	if (input.isZeroLarvae) {
		return 'zero_larvae';
	}
	if (input.unidentifiableReason !== null && input.unidentifiableReason.trim().length > 0) {
		return 'unidentifiable';
	}
	return 'awaiting';
}

function sampleName(geo: SampleGeoRow): string {
	return geo.displayName?.trim() || `Sample ${geo.id.slice(0, 8)}`;
}

function habitatLabel(geo: SampleGeoRow): string {
	return (
		geo.habitatName?.trim() ||
		(geo.habitatId === null ? 'Ad-hoc' : `Habitat ${geo.habitatId.slice(0, 8)}`)
	);
}

function breadcrumbLabel(geo: SampleGeoRow): string {
	return `Sample · ${formatMonthDayYear(geo.inspectionDate)}`;
}

function coordinateLabel(geo: SampleGeoRow): string {
	return formatCoordinates(geo.lat, geo.lng) ?? 'Unknown coordinates';
}

function messageOf(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}

/** Long-form date from a `YYYY-MM-DD` string (parsed as its own UTC day). */
function formatFullDate(date: string): string {
	const parsed = parseDateOnly(date);
	if (parsed === null) {
		return date;
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(parsed);
}

function formatMonthDayYear(date: string): string {
	const parsed = parseDateOnly(date);
	if (parsed === null) {
		return date;
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(parsed);
}

function parseDateOnly(date: string): Date | null {
	const parts = date.slice(0, 10).split('-');
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (!(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))) {
		return null;
	}
	return new Date(Date.UTC(year, month - 1, day));
}

function formatDateTime(value: string, timeZone: string | undefined): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}
	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		...(timeZone === undefined ? {} : { timeZone }),
	}).format(date);
}
