import {
	boundsFromGeoJson,
	centroidFromGeoJson,
	countGeoJsonVertices,
	type GeoJsonGeometry,
} from '@simmer-mosquito/mapping';
import type {
	OrganizationSpeciesRow,
	SampleRow,
	SampleSpeciesRow,
	SpeciesRow,
} from '@simmer-mosquito/sync';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
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
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@simmer-mosquito/ui-web/components/ui/command';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	ArrowLeftIcon,
	CalendarIcon,
	CheckIcon,
	ChevronDownIcon,
	iconRegistry,
	Loader2Icon,
	PlusIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { type MapCamera, MapCanvas } from '../../../components/map';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { webCollections } from '../../../sync/webCollections';

export const Route = createFileRoute('/larval-surveillance/samples/$id')({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <SampleDetail sampleId={id} />;
}

const SampleIcon = iconRegistry.entities.sample.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;
const InspectionIcon = iconRegistry.entities.inspection.icon;
const HabitatIcon = iconRegistry.simmer.fieldWork.icon;

// The sample record + its species rows stream from on-demand collections; keep the
// subset warm briefly after unmount so returning to the page reuses it.
const sampleRecordGcTimeMs = 30_000;

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

type MutableSampleRow = { -readonly [Key in keyof SampleRow]: SampleRow[Key] };
type MutableSampleSpeciesRow = { -readonly [Key in keyof SampleSpeciesRow]: SampleSpeciesRow[Key] };

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

export function SampleDetail({ sampleId }: { readonly sampleId: string }) {
	const query = useSampleGeoContext(sampleId);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 pb-10">
				<SampleTopBar
					habitatId={query.data?.habitatId ?? null}
					inspectionId={query.data?.inspectionId ?? null}
				/>
				{query.isPending ? (
					<SampleDetailSkeleton />
				) : query.isError || query.data == null ? (
					<SampleUnavailable />
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
							<span className="italic">Ad-hoc inspection</span>
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
	const bounds = useMemo(
		() => (geometry === null ? null : boundsFromGeoJson(geometry)),
		[geometry],
	);
	const centroid = useMemo(
		() => (geometry === null ? null : centroidFromGeoJson(geometry)),
		[geometry],
	);
	const camera = useMemo<MapCamera | undefined>(
		() => (centroid === null ? undefined : { center: [centroid.lng, centroid.lat], zoom: 15 }),
		[centroid],
	);
	const mapRef = useRef<MapboxMap | null>(null);
	const fitToBounds = useCallback(
		(map: MapboxMap) => {
			if (bounds === null) {
				return;
			}
			const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
			if (hasArea) {
				map.fitBounds(
					[
						[bounds.west, bounds.south],
						[bounds.east, bounds.north],
					],
					{ padding: 48, maxZoom: 17, duration: 0 },
				);
			} else {
				map.setCenter([bounds.west, bounds.south]);
				map.setZoom(16);
			}
		},
		[bounds],
	);
	const handleMapReady = useCallback(
		(map: MapboxMap) => {
			mapRef.current = map;
			fitToBounds(map);
		},
		[fitToBounds],
	);
	useEffect(() => {
		if (mapRef.current !== null) {
			fitToBounds(mapRef.current);
		}
	}, [fitToBounds]);

	return (
		<Card className="overflow-hidden" variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Location</CardTitle>
				<CardDescription>{locationSummary(geometry, geomType)}</CardDescription>
			</CardHeader>
			<CardContent padding="compact">
				{geometry === null ? (
					<Empty className="min-h-[240px] border border-border/40 bg-muted/30">
						<EmptyHeader>
							<EmptyTitle>No Geometry Recorded</EmptyTitle>
							<EmptyDescription>The parent inspection has no location to display.</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="h-[240px] overflow-hidden rounded-md border border-border/40">
						<MapCanvas
							controls={{ search: false, layers: false, geolocate: false }}
							geoJson={geometry as unknown as GeoJSON.GeoJSON}
							onMapReady={handleMapReady}
							{...(camera === undefined ? {} : { camera })}
						/>
					</div>
				)}
			</CardContent>
		</Card>
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

	// The on-demand sample record — the source of truth for the disposition flags
	// and label. Falls back to the one-shot seed until the subset is ready.
	const recordResult = useLiveQuery(
		{
			gcTime: sampleRecordGcTimeMs,
			query: (query) =>
				query
					.from({ sample: webCollections.samples })
					.where(({ sample }) => eq(sample.id, sampleId)),
		},
		[sampleId],
	);
	const speciesResult = useLiveQuery(
		{
			gcTime: sampleRecordGcTimeMs,
			query: (query) =>
				query
					.from({ sampleSpecies: webCollections.sampleSpecies })
					.where(({ sampleSpecies }) => eq(sampleSpecies.sampleId, sampleId))
					.orderBy(({ sampleSpecies }) => sampleSpecies.larvaeCount, 'desc'),
		},
		[sampleId],
	);

	const record = (recordResult.data ?? [])[0] as SampleRow | undefined;
	const speciesRows = (speciesResult.data ?? []) as readonly SampleSpeciesRow[];
	const isReady = recordResult.isReady && speciesResult.isReady;
	const isError = recordResult.isError || speciesResult.isError;

	const { nameById, options } = useSpeciesCatalog();

	// Prefer the live record; fall back to the fetched seed while the subset loads.
	const isZeroLarvae = record?.isZeroLarvae ?? seed.isZeroLarvae;
	const hasNonMosquito = record?.hasNonMosquito ?? seed.hasNonMosquito;
	const unidentifiableReason = record?.unidentifiableReason ?? seed.unidentifiableReason;
	const displayName = record?.displayName ?? seed.displayName;

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

	const guard = useCallback((): boolean => {
		if (!canManage || identity?.organizationId == null) {
			setError('You do not have permission to manage this sample.');
			return false;
		}
		return true;
	}, [canManage, identity]);

	const handleAddSpecies = useCallback(
		async (speciesId: string, larvaeCount: number) => {
			if (!guard() || identity?.organizationId == null) {
				return;
			}
			setError(null);
			const now = new Date().toISOString();
			const row: SampleSpeciesRow = {
				id: crypto.randomUUID(),
				organizationId: identity.organizationId,
				sampleId,
				speciesId,
				larvaeCount,
				identifiedByProfileId: identity.profileId,
				identifiedAt: now,
				createdByProfileId: identity.profileId,
				updatedByProfileId: identity.profileId,
				createdAt: now,
				updatedAt: now,
			};
			try {
				await webCollections.sampleSpecies.insert(row).isPersisted.promise;
			} catch (cause) {
				setError(messageOf(cause, 'Unable to add species.'));
			}
		},
		[guard, identity, sampleId],
	);

	const handleUpdateCount = useCallback(
		async (rowId: string, larvaeCount: number) => {
			if (!guard()) {
				return;
			}
			setError(null);
			try {
				await webCollections.sampleSpecies.update(rowId, (draft) => {
					(draft as MutableSampleSpeciesRow).larvaeCount = larvaeCount;
				}).isPersisted.promise;
			} catch (cause) {
				setError(messageOf(cause, 'Unable to update count.'));
			}
		},
		[guard],
	);

	const handleRemoveSpecies = useCallback(
		async (rowId: string) => {
			if (!guard()) {
				return;
			}
			setError(null);
			try {
				await webCollections.sampleSpecies.delete(rowId).isPersisted.promise;
			} catch (cause) {
				setError(messageOf(cause, 'Unable to remove species.'));
			}
		},
		[guard],
	);

	const patchSample = useCallback(
		async (mutate: (draft: MutableSampleRow) => void, fallback: string) => {
			if (!guard()) {
				return;
			}
			setError(null);
			try {
				await webCollections.samples.update(sampleId, (draft) => mutate(draft as MutableSampleRow))
					.isPersisted.promise;
			} catch (cause) {
				setError(messageOf(cause, fallback));
			}
		},
		[guard, sampleId],
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
					<Badge tone={meta.tone} variant="outline">
						{meta.label}
					</Badge>
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
								nameById={nameById}
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
							onPatch={patchSample}
							unidentifiableReason={unidentifiableReason}
						/>
					</>
				)}
			</CardContent>
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
	readonly rows: readonly SampleSpeciesRow[];
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
	readonly row: SampleSpeciesRow;
	readonly name: string;
	readonly canManage: boolean;
	readonly onUpdateCount: (rowId: string, count: number) => Promise<void>;
	readonly onRemove: (rowId: string) => Promise<void>;
}) {
	const [draft, setDraft] = useState(String(row.larvaeCount));
	const [busy, setBusy] = useState(false);

	// Keep the input in sync when the persisted value changes out from under us.
	useEffect(() => {
		setDraft(String(row.larvaeCount));
	}, [row.larvaeCount]);

	const commit = async () => {
		const next = Number.parseInt(draft, 10);
		if (!Number.isFinite(next) || next < 0) {
			setDraft(String(row.larvaeCount));
			return;
		}
		if (next === row.larvaeCount) {
			return;
		}
		setBusy(true);
		try {
			await onUpdateCount(row.id, next);
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
					<Input
						aria-label={`Larvae count for ${name}`}
						className="h-8 w-20 text-right tabular-nums"
						disabled={busy}
						inputMode="numeric"
						min={0}
						onBlur={() => void commit()}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								void commit();
							}
						}}
						type="number"
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
	nameById,
	onAdd,
}: {
	readonly options: readonly SpeciesOption[];
	readonly takenSpeciesIds: ReadonlySet<string>;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onAdd: (speciesId: string, count: number) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [speciesId, setSpeciesId] = useState<string | null>(null);
	const [count, setCount] = useState('1');
	const [busy, setBusy] = useState(false);

	const available = useMemo(
		() => options.filter((option) => !takenSpeciesIds.has(option.id)),
		[options, takenSpeciesIds],
	);

	const parsedCount = Number.parseInt(count, 10);
	const canAdd = speciesId !== null && Number.isFinite(parsedCount) && parsedCount >= 0 && !busy;

	const submit = async () => {
		if (speciesId === null || !Number.isFinite(parsedCount) || parsedCount < 0 || busy) {
			return;
		}
		setBusy(true);
		try {
			await onAdd(speciesId, parsedCount);
			setSpeciesId(null);
			setCount('1');
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="grid gap-1.5">
			<SectionLabel>Add species</SectionLabel>
			<div className="flex flex-wrap items-center gap-2">
				<Popover onOpenChange={setOpen} open={open}>
					<PopoverTrigger asChild>
						<button
							aria-label="Choose species"
							className={cn(
								'inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								speciesId === null ? 'text-muted-foreground' : 'text-foreground',
							)}
							type="button"
						>
							<SpeciesIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
							<span className={cn('min-w-0 flex-1 truncate', speciesId !== null && 'italic')}>
								{speciesId === null ? 'Select a species…' : (nameById.get(speciesId) ?? 'Species')}
							</span>
							<ChevronDownIcon
								aria-hidden="true"
								className="size-4 shrink-0 text-muted-foreground"
							/>
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 p-0">
						<Command>
							<CommandInput placeholder="Search species…" />
							<CommandList>
								<CommandEmpty>
									{available.length === 0
										? 'All catalog species are already identified.'
										: 'No species match.'}
								</CommandEmpty>
								<CommandGroup>
									{available.map((option) => (
										<CommandItem
											key={option.id}
											onSelect={() => {
												setSpeciesId(option.id);
												setOpen(false);
											}}
											value={`${option.label} ${option.id}`}
										>
											<span
												className={cn(
													'flex size-4 items-center justify-center rounded-sm border',
													option.id === speciesId
														? 'border-primary bg-primary text-primary-foreground'
														: 'border-input',
												)}
											>
												{option.id === speciesId ? (
													<CheckIcon aria-hidden="true" className="size-3" />
												) : null}
											</span>
											<span className="truncate italic">{option.label}</span>
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
				<Input
					aria-label="Larvae count"
					className="h-9 w-24 text-right tabular-nums"
					inputMode="numeric"
					min={0}
					onChange={(event) => setCount(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && canAdd) {
							event.preventDefault();
							void submit();
						}
					}}
					placeholder="Count"
					type="number"
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
	onPatch,
}: {
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly displayName: string | null;
	readonly hasSpecies: boolean;
	readonly canManage: boolean;
	readonly onPatch: (mutate: (draft: MutableSampleRow) => void, fallback: string) => Promise<void>;
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
				onCheckedChange={(next) =>
					void onPatch((draft) => {
						draft.isZeroLarvae = next;
					}, 'Unable to update the sample.')
				}
			/>
			<SwitchRow
				checked={hasNonMosquito}
				description="Contains non-mosquito organisms or debris."
				disabled={!canManage}
				label="Non-mosquito material"
				onCheckedChange={(next) =>
					void onPatch((draft) => {
						draft.hasNonMosquito = next;
					}, 'Unable to update the sample.')
				}
			/>

			<TextPatchField
				canManage={canManage}
				description="Note why the specimens could not be identified. Clearing it removes the flag."
				label="Unidentifiable reason"
				onCommit={(value) =>
					onPatch((draft) => {
						draft.unidentifiableReason = value === '' ? null : value;
					}, 'Unable to update the sample.')
				}
				placeholder="e.g. specimens too damaged to key out"
				value={unidentifiableReason ?? ''}
			/>

			<TextPatchField
				canManage={canManage}
				description="An optional label to identify this sample in lists."
				label="Sample label"
				onCommit={(value) =>
					onPatch((draft) => {
						draft.displayName = value === '' ? null : value;
					}, 'Unable to update the sample.')
				}
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
							<span className="text-muted-foreground italic">Ad-hoc — no habitat</span>
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
					<DetailRow label="Recorded">{formatDateTime(geo.createdAt)}</DetailRow>
					<DetailRow label="Updated">{formatDateTime(geo.updatedAt)}</DetailRow>
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
	const speciesResult = useLiveQuery(
		(query) => query.from({ species: webCollections.species }),
		[],
	);
	const orgSpeciesResult = useLiveQuery(
		(query) => query.from({ orgSpecies: webCollections.organizationSpecies }),
		[],
	);

	const species = (speciesResult.data ?? []) as readonly SpeciesRow[];
	const orgSpecies = (orgSpeciesResult.data ?? []) as readonly OrganizationSpeciesRow[];

	const nameById = useMemo(
		() => new Map(species.map((row) => [row.id, row.displayName] as const)),
		[species],
	);

	const options = useMemo(() => {
		const orgIds = new Set(orgSpecies.map((row) => row.speciesId));
		const source = orgIds.size > 0 ? species.filter((row) => orgIds.has(row.id)) : species;
		return source
			.map((row) => ({ id: row.id, label: row.displayName }))
			.sort((first, second) => first.label.localeCompare(second.label));
	}, [species, orgSpecies]);

	return { nameById, options };
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
	const response = await fetch(new URL(`/map/samples/${id}`, getServerUrl()), {
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

function SampleUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Sample Unavailable</EmptyTitle>
				<EmptyDescription>
					This sample could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
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
	if (geo.lat == null || geo.lng == null) {
		return 'Unknown coordinates';
	}
	return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`;
}

function locationSummary(geometry: GeoJsonGeometry | null, geomType: string | null): string {
	if (geometry === null) {
		return 'No geometry recorded';
	}
	return `${formatGeometryTypeLabel(geomType ?? geometry.type)} · ${countGeoJsonVertices(geometry)} vertices`;
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

function formatDateTime(value: string): string {
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
	}).format(date);
}

function formatGeometryTypeLabel(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/^st_?/, '')
		.replace(/[_\s]+/g, '');
	switch (normalized) {
		case 'point':
			return 'Point';
		case 'multipoint':
			return 'Multi-point';
		case 'linestring':
			return 'Line';
		case 'multilinestring':
			return 'Multi-line';
		case 'polygon':
			return 'Polygon';
		case 'multipolygon':
			return 'Multi-polygon';
		case 'geometrycollection':
			return 'Geometry collection';
		default:
			return value.trim() === '' ? 'Unknown geometry' : value;
	}
}
