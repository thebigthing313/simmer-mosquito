import {
	type LarvalInspectionEntryMode,
	resolveOrganizationSettings,
} from '@simmer-mosquito/domain';
import {
	boundsFromGeoJson,
	centroidFromGeoJson,
	countGeoJsonVertices,
	type GeoJsonGeometry,
} from '@simmer-mosquito/mapping';
import type { HabitatRow, LarvalDensity, TagRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '@simmer-mosquito/ui-web/components/ui/pagination';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tabs';
import {
	AlertTriangleIcon,
	ArrowLeftIcon,
	CheckCircle2Icon,
	MapPinnedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { and, eq, toArray, useLiveQuery, useLiveSuspenseQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import {
	type CSSProperties,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { getServerUrl } from '../auth';
import { createGeoJsonMapSource, type MapCamera, MapView } from '../map';
import { webCollections } from '../sync/webCollections';

const historyPageSize = 25;
// Keep the on-demand inspection/sample/species subsets warm briefly after unmount
// so quick navigation between habitats reuses them instead of refetching them.
const historyGcTimeMs = 30_000;
// Same rationale for the on-demand tag_items subset behind the Details "Tags" row.
const tagsGcTimeMs = 30_000;

interface HabitatGeometry {
	readonly geojson: GeoJsonGeometry | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
}

// Projected shapes of the nested includes query (inspection -> samples -> species).
interface HistorySampleSpecies {
	readonly id: string;
	readonly speciesId: string;
	readonly larvaeCount: number;
}

interface HistorySample {
	readonly id: string;
	readonly inspectionId: string;
	readonly displayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly species: readonly HistorySampleSpecies[];
}

interface HistoryInspection {
	readonly id: string;
	readonly inspectionDate: string;
	readonly inspectedByProfileId: string | null;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly samples: readonly HistorySample[];
}

interface HistorySampleRow extends HistorySample {
	readonly inspectionDate: string;
}

interface HabitatDetailProps {
	readonly habitatId: string;
}

export function HabitatDetail({ habitatId }: HabitatDetailProps) {
	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 pb-10">
				<div>
					<Link
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
						to="/habitats"
					>
						<ArrowLeftIcon aria-hidden="true" />
						Back to habitats
					</Link>
				</div>
				<Suspense fallback={<HabitatDetailSkeleton />}>
					<HabitatDetailLoader habitatId={habitatId} />
				</Suspense>
			</div>
		</div>
	);
}

function HabitatDetailLoader({ habitatId }: { readonly habitatId: string }) {
	// Record fields stream live from the synced (on-demand) habitats collection,
	// so detail edits propagate without a manual refetch.
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ habitat: webCollections.habitats })
				.where(({ habitat }) => eq(habitat.id, habitatId))
				.findOne(),
		[habitatId],
	);

	const habitat = result.data;
	if (habitat === undefined) {
		return <HabitatDetailUnavailable />;
	}

	return <HabitatDetailContent habitat={habitat} />;
}

function HabitatDetailContent({ habitat }: { readonly habitat: HabitatRow }) {
	// Geometry is not part of the Electric shape (ADR 0009), so it is fetched from
	// the server display endpoint. Keying on updatedAt makes it refetch whenever
	// the synced record changes, keeping the map in step with edits.
	const { data: geometry, isPending: isGeometryPending } = useHabitatGeometry(
		habitat.id,
		habitat.updatedAt,
	);
	const resolvedGeometry = geometry ?? null;

	return (
		<>
			<HabitatDetailHeader habitat={habitat} />
			<div className="grid gap-5 lg:grid-cols-2">
				<HabitatLocationCard geometry={resolvedGeometry} isPending={isGeometryPending} />
				<HabitatDetailsCard
					geometry={resolvedGeometry}
					habitat={habitat}
					isGeometryPending={isGeometryPending}
				/>
			</div>
			<Suspense fallback={<HistorySkeleton />}>
				<HabitatHistoryCard habitatId={habitat.id} />
			</Suspense>
		</>
	);
}

function HabitatDetailHeader({ habitat }: { readonly habitat: HabitatRow }) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid gap-1">
				<h1 className="m-0 text-[1.5rem] leading-tight font-semibold text-foreground">
					{habitatName(habitat)}
				</h1>
				<Suspense fallback={<span className="text-sm text-muted-foreground">Loading type…</span>}>
					<HabitatTypeLabel habitatTypeId={habitat.habitatTypeId} />
				</Suspense>
			</div>
			<HabitatStateBadges habitat={habitat} />
		</div>
	);
}

function HabitatTypeLabel({ habitatTypeId }: { readonly habitatTypeId: string | null }) {
	const typeName = useHabitatTypeName(habitatTypeId);
	return <span className="text-[0.95rem] text-muted-foreground">{typeName}</span>;
}

function HabitatStateBadges({ habitat }: { readonly habitat: HabitatRow }) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{habitat.isActive ? (
				<Badge variant="outline" tone="success">
					<CheckCircle2Icon aria-hidden="true" />
					Active
				</Badge>
			) : (
				<Badge variant="outline" tone="neutral">
					Inactive
				</Badge>
			)}
			{habitat.isInaccessible ? (
				<Badge variant="outline" tone="danger">
					<AlertTriangleIcon aria-hidden="true" />
					Inaccessible
				</Badge>
			) : null}
		</div>
	);
}

function HabitatLocationCard({
	geometry,
	isPending,
}: {
	readonly geometry: HabitatGeometry | null;
	readonly isPending: boolean;
}) {
	const geojson = geometry?.geojson ?? null;
	const bounds = useMemo(() => (geojson === null ? null : boundsFromGeoJson(geojson)), [geojson]);
	const centroid = useMemo(
		() => (geojson === null ? null : centroidFromGeoJson(geojson)),
		[geojson],
	);
	const camera = useMemo<MapCamera | undefined>(
		() => (centroid === null ? undefined : { center: [centroid.lng, centroid.lat], zoom: 15 }),
		[centroid],
	);
	const geoJsonSources = useMemo(
		() =>
			geojson === null
				? []
				: [
						createGeoJsonMapSource({
							id: 'habitat-geometry',
							data: geojson as unknown as GeoJSON.GeoJSON,
						}),
					],
		[geojson],
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
	// Refit when the geometry changes underneath an already-loaded map (e.g. the
	// keyed geometry refetch returns a moved habitat), since onMapReady fires once.
	useEffect(() => {
		if (mapRef.current !== null) {
			fitToBounds(mapRef.current);
		}
	}, [fitToBounds]);

	return (
		<Card variant="surface" className="overflow-hidden">
			<CardHeader className="px-4 py-4">
				<div>
					<CardTitle>Location</CardTitle>
					<CardDescription>{locationSummary(geometry, isPending)}</CardDescription>
				</div>
			</CardHeader>
			<CardContent padding="compact">
				{isPending ? (
					<Skeleton className="h-[380px] w-full" />
				) : geojson === null ? (
					<Empty className="min-h-[320px] border border-border/40 bg-muted/30">
						<EmptyHeader>
							<EmptyTitle>No geometry recorded</EmptyTitle>
							<EmptyDescription>This habitat has no location to display.</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="h-[380px] overflow-hidden rounded-md border border-border/40">
						<MapView
							className="min-h-0 rounded-none border-0"
							geoJsonSources={geoJsonSources}
							onMapReady={handleMapReady}
							{...(camera === undefined ? {} : { camera })}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function HabitatDetailsCard({
	geometry,
	habitat,
	isGeometryPending,
}: {
	readonly geometry: HabitatGeometry | null;
	readonly habitat: HabitatRow;
	readonly isGeometryPending: boolean;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent padding="compact" className="grid gap-4">
				<div className="grid gap-1">
					<span className="text-xs font-semibold text-muted-foreground uppercase">Description</span>
					<p className="m-0 text-sm text-foreground">{habitatDescription(habitat)}</p>
				</div>
				<dl className="grid gap-2.5">
					<DetailRow label="Habitat type">
						<Suspense fallback={<span className="text-muted-foreground">Loading…</span>}>
							<HabitatTypeLabel habitatTypeId={habitat.habitatTypeId} />
						</Suspense>
					</DetailRow>
					<DetailRow label="Address">
						<Suspense fallback={<span className="text-muted-foreground">Loading address…</span>}>
							<HabitatAddress addressId={habitat.addressId} />
						</Suspense>
					</DetailRow>
					<DetailRow label="Tags">
						<Suspense fallback={<span className="text-muted-foreground">Loading tags…</span>}>
							<HabitatTags habitatId={habitat.id} />
						</Suspense>
					</DetailRow>
					<DetailRow label="Geometry">{geometrySummary(geometry, isGeometryPending)}</DetailRow>
					<DetailRow label="Coordinates">
						{isGeometryPending ? 'Loading…' : coordinateLabel(geometry)}
					</DetailRow>
					<DetailRow label="Created">
						<AuditValue at={habitat.createdAt} profileId={habitat.createdByProfileId} />
					</DetailRow>
					<DetailRow label="Updated">
						<AuditValue at={habitat.updatedAt} profileId={habitat.updatedByProfileId} />
					</DetailRow>
				</dl>
				<HabitatMetadata metadata={habitat.metadata} />
			</CardContent>
		</Card>
	);
}

function HabitatMetadata({ metadata }: { readonly metadata: unknown }) {
	const entries = useMemo(() => toMetadataEntries(metadata), [metadata]);
	if (entries.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1.5">
			<span className="text-xs font-semibold text-muted-foreground uppercase">Metadata</span>
			<dl className="grid gap-1.5">
				{entries.map(([key, value]) => (
					<DetailRow key={key} label={key}>
						{value}
					</DetailRow>
				))}
			</dl>
		</div>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[120px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function AuditValue({ at, profileId }: { readonly at: string; readonly profileId: string | null }) {
	return (
		<span>
			{formatDateTime(at)}
			{profileId === null ? null : (
				<>
					{' by '}
					<Suspense fallback={<span className="text-muted-foreground">…</span>}>
						<ProfileName profileId={profileId} />
					</Suspense>
				</>
			)}
		</span>
	);
}

function HabitatAddress({ addressId }: { readonly addressId: string | null }) {
	if (addressId === null) {
		return <span className="text-muted-foreground">No linked address</span>;
	}

	return <ResolvedHabitatAddress addressId={addressId} />;
}

function ResolvedHabitatAddress({ addressId }: { readonly addressId: string }) {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ address: webCollections.addresses })
				.where(({ address }) => eq(address.id, addressId))
				.findOne(),
		[addressId],
	);

	const address = result.data;
	if (address === undefined) {
		return <span className="text-muted-foreground">Linked address unavailable</span>;
	}

	return (
		<span className="inline-flex items-center gap-1.5">
			<MapPinnedIcon aria-hidden="true" className="text-muted-foreground" />
			{address.displayName}
		</span>
	);
}

function HabitatTags({ habitatId }: { readonly habitatId: string }) {
	// tag_items is an on-demand collection, so this mirrors HabitatHistoryCard:
	// non-suspense useLiveQuery gated on status, NOT useLiveSuspenseQuery, to
	// avoid the permanent post-unmount suspense hang on on-demand collections.
	const assigned = useLiveQuery(
		{
			gcTime: tagsGcTimeMs,
			query: (query) =>
				query
					.from({ tagItem: webCollections.tagItems })
					.where(({ tagItem }) =>
						and(eq(tagItem.entityType, 'habitat'), eq(tagItem.entityId, habitatId)),
					)
					.select(({ tagItem }) => ({ id: tagItem.id, tagId: tagItem.tagId })),
		},
		[habitatId],
	);

	// tags is an eager baseline collection, so suspense is safe here.
	const catalog = useLiveSuspenseQuery((query) => query.from({ tag: webCollections.tags }), []);

	const tags = useMemo(() => {
		const tagsById = new Map(catalog.data.map((tag) => [tag.id, tag]));
		return (assigned.data ?? [])
			.flatMap((item) => {
				const tag = tagsById.get(item.tagId);
				return tag === undefined ? [] : [tag];
			})
			.sort((first, second) => first.tagName.localeCompare(second.tagName));
	}, [assigned.data, catalog.data]);

	if (assigned.isError) {
		return <span className="text-muted-foreground">Tags unavailable</span>;
	}
	if (!assigned.isReady) {
		return <span className="text-muted-foreground">Loading tags…</span>;
	}
	if (tags.length === 0) {
		return <span className="text-muted-foreground">No tags</span>;
	}

	return (
		<div className="flex flex-wrap gap-1.5">
			{tags.map((tag) => (
				<TagBadge key={tag.id} tag={tag} />
			))}
		</div>
	);
}

function TagBadge({ tag }: { readonly tag: TagRow }) {
	const color = validHexColor(tag.color);
	const style =
		color === null
			? undefined
			: ({
					'--tag-bg': hexWithAlpha(color, 0.14),
					'--tag-border': hexWithAlpha(color, 0.36),
					'--tag-color': color,
				} as CSSProperties);

	return (
		<Badge
			variant={color === null ? 'secondary' : 'outline'}
			className={
				color === null ? undefined : 'border-(--tag-border) bg-(--tag-bg) text-(--tag-color)'
			}
			style={style}
			title={tag.description ?? undefined}
		>
			{tag.tagName}
		</Badge>
	);
}

function HabitatHistoryCard({ habitatId }: { readonly habitatId: string }) {
	// Nested includes query: inspections for the habitat, each with its samples
	// (correlated on inspection_id) and each sample's species (correlated on
	// sample_id). The correlated eq()s drive Electric on-demand subset loading.
	//
	// Uses non-suspense useLiveQuery gated on status, NOT useLiveSuspenseQuery:
	// the suspense variant gets permanently stuck after a navigation unmount —
	// it caches collection.preload() in a ref and only clears it on a `ready`
	// status it observes, but the recreated collection never re-resolves that
	// cached promise. useLiveQuery reads live status instead and recovers.
	const result = useLiveQuery(
		{
			gcTime: historyGcTimeMs,
			query: (query) =>
				query
					.from({ inspection: webCollections.inspections })
					.where(({ inspection }) => eq(inspection.habitatId, habitatId))
					.orderBy(({ inspection }) => inspection.inspectionDate, 'desc')
					.select(({ inspection }) => ({
						id: inspection.id,
						inspectionDate: inspection.inspectionDate,
						inspectedByProfileId: inspection.inspectedByProfileId,
						isWet: inspection.isWet,
						dipCount: inspection.dipCount,
						density: inspection.density,
						larvaeCount: inspection.larvaeCount,
						hasEggs: inspection.hasEggs,
						hasFirstInstar: inspection.hasFirstInstar,
						hasSecondInstar: inspection.hasSecondInstar,
						hasThirdInstar: inspection.hasThirdInstar,
						hasFourthInstar: inspection.hasFourthInstar,
						hasPupae: inspection.hasPupae,
						samples: toArray(
							query
								.from({ sample: webCollections.samples })
								.where(({ sample }) => eq(sample.inspectionId, inspection.id))
								.select(({ sample }) => ({
									id: sample.id,
									inspectionId: sample.inspectionId,
									displayName: sample.displayName,
									isZeroLarvae: sample.isZeroLarvae,
									hasNonMosquito: sample.hasNonMosquito,
									unidentifiableReason: sample.unidentifiableReason,
									species: toArray(
										query
											.from({ sampleSpecies: webCollections.sampleSpecies })
											.where(({ sampleSpecies }) => eq(sampleSpecies.sampleId, sample.id))
											.select(({ sampleSpecies }) => ({
												id: sampleSpecies.id,
												speciesId: sampleSpecies.speciesId,
												larvaeCount: sampleSpecies.larvaeCount,
											})),
									),
								})),
						),
					})),
		},
		[habitatId],
	);

	const inspections = (result.data ?? []) as unknown as readonly HistoryInspection[];
	const samples = useMemo<readonly HistorySampleRow[]>(
		() =>
			inspections.flatMap((inspection) =>
				inspection.samples.map((sample) => ({
					...sample,
					inspectionDate: inspection.inspectionDate,
				})),
			),
		[inspections],
	);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>History</CardTitle>
				<CardDescription>Recent larval inspections and samples for this habitat.</CardDescription>
			</CardHeader>
			<CardContent padding="compact">
				{result.isError ? (
					<HistoryEmpty
						title="History unavailable"
						description="Inspection and sample history could not be loaded."
					/>
				) : result.isReady ? (
					<Tabs defaultValue="inspections">
						<TabsList>
							<TabsTrigger value="inspections">Inspections ({inspections.length})</TabsTrigger>
							<TabsTrigger value="samples">Samples ({samples.length})</TabsTrigger>
						</TabsList>
						<TabsContent value="inspections" className="pt-4">
							<InspectionHistory inspections={inspections} />
						</TabsContent>
						<TabsContent value="samples" className="pt-4">
							<SampleHistory samples={samples} />
						</TabsContent>
					</Tabs>
				) : (
					<TableSkeleton rows={5} />
				)}
			</CardContent>
		</Card>
	);
}

function InspectionHistory({
	inspections,
}: {
	readonly inspections: readonly HistoryInspection[];
}) {
	const { page, pageCount, pageRows, setPage } = usePagedRows(inspections, historyPageSize);
	// The agency's larval data mode decides which abundance columns are meaningful:
	// density-only entry hides larvae, count-and-dips entry hides the derived
	// density, and hybrid shows all three.
	const columns = inspectionColumnsForMode(useLarvalEntryMode());

	if (inspections.length === 0) {
		return (
			<HistoryEmpty
				title="No inspections yet"
				description="Larval inspections recorded for this habitat will show here."
			/>
		);
	}

	return (
		<div className="grid gap-2">
			<ScrollArea className="max-h-[420px]">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Date</TableHead>
							<TableHead>Inspector</TableHead>
							<TableHead>Wet</TableHead>
							{columns.dips ? <TableHead className="text-right">Dips</TableHead> : null}
							{columns.density ? <TableHead>Density</TableHead> : null}
							{columns.larvae ? <TableHead className="text-right">Larvae</TableHead> : null}
							<TableHead>Stages</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{pageRows.map((inspection) => (
							<TableRow key={inspection.id}>
								<TableCell className="whitespace-nowrap">
									{formatDate(inspection.inspectionDate)}
								</TableCell>
								<TableCell className="whitespace-nowrap">
									{inspection.inspectedByProfileId === null ? (
										<span className="text-muted-foreground">—</span>
									) : (
										<Suspense fallback={<span className="text-muted-foreground">…</span>}>
											<ProfileName profileId={inspection.inspectedByProfileId} />
										</Suspense>
									)}
								</TableCell>
								<TableCell>{inspection.isWet ? 'Yes' : 'No'}</TableCell>
								{columns.dips ? (
									<TableCell className="text-right tabular-nums">
										{inspection.dipCount ?? '—'}
									</TableCell>
								) : null}
								{columns.density ? (
									<TableCell>
										<DensityBadge density={inspection.density} />
									</TableCell>
								) : null}
								{columns.larvae ? (
									<TableCell className="text-right tabular-nums">
										{inspection.larvaeCount ?? '—'}
									</TableCell>
								) : null}
								<TableCell>
									<LifeStageStrip inspection={inspection} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</ScrollArea>
			<HistoryPagination
				noun="inspections"
				onPageChange={setPage}
				page={page}
				pageCount={pageCount}
				total={inspections.length}
			/>
		</div>
	);
}

function SampleHistory({ samples }: { readonly samples: readonly HistorySampleRow[] }) {
	const sortedSamples = useMemo(
		() => [...samples].sort((a, b) => b.inspectionDate.localeCompare(a.inspectionDate)),
		[samples],
	);
	const { page, pageCount, pageRows, setPage } = usePagedRows(sortedSamples, historyPageSize);

	if (samples.length === 0) {
		return (
			<HistoryEmpty
				title="No samples yet"
				description="Samples appear once an inspection on this habitat records them."
			/>
		);
	}

	return (
		<div className="grid gap-2">
			<ScrollArea className="max-h-[420px]">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Sample</TableHead>
							<TableHead>Inspection date</TableHead>
							<TableHead>Result</TableHead>
							<TableHead>Species</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{pageRows.map((sample) => (
							<TableRow key={sample.id}>
								<TableCell className="whitespace-nowrap">{sampleName(sample)}</TableCell>
								<TableCell className="whitespace-nowrap">
									{formatDate(sample.inspectionDate)}
								</TableCell>
								<TableCell>{formatSampleResult(sample)}</TableCell>
								<TableCell>
									<SampleSpeciesSummary species={sample.species} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</ScrollArea>
			<HistoryPagination
				noun="samples"
				onPageChange={setPage}
				page={page}
				pageCount={pageCount}
				total={samples.length}
			/>
		</div>
	);
}

function SampleSpeciesSummary({ species }: { readonly species: readonly HistorySampleSpecies[] }) {
	if (species.length === 0) {
		return <span className="text-muted-foreground">No species identified</span>;
	}

	return (
		<Suspense fallback={<span className="text-muted-foreground">…</span>}>
			<div className="flex flex-wrap gap-1.5">
				{species.map((row) => (
					<SampleSpeciesChip key={row.id} row={row} />
				))}
			</div>
		</Suspense>
	);
}

function SampleSpeciesChip({ row }: { readonly row: HistorySampleSpecies }) {
	const speciesName = useSpeciesName(row.speciesId);
	return (
		<Badge variant="outline" tone="neutral">
			{speciesName}
			<span className="tabular-nums">{row.larvaeCount}</span>
		</Badge>
	);
}

function ProfileName({ profileId }: { readonly profileId: string }) {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ profile: webCollections.profiles })
				.where(({ profile }) => eq(profile.id, profileId))
				.findOne(),
		[profileId],
	);

	return <>{result.data?.displayName ?? 'Unknown'}</>;
}

function useHabitatTypeName(habitatTypeId: string | null): string {
	const result = useLiveSuspenseQuery(
		(query) => query.from({ habitatType: webCollections.habitatTypes }),
		[],
	);

	if (habitatTypeId === null) {
		return 'Unassigned type';
	}

	const match = result.data.find((habitatType) => habitatType.id === habitatTypeId);
	return match?.name ?? 'Unknown type';
}

interface InspectionColumns {
	readonly dips: boolean;
	readonly density: boolean;
	readonly larvae: boolean;
}

function inspectionColumnsForMode(mode: LarvalInspectionEntryMode): InspectionColumns {
	switch (mode) {
		case 'density_only':
			return { dips: true, density: true, larvae: false };
		case 'count_and_dips_required':
			return { dips: true, density: false, larvae: true };
		default:
			return { dips: true, density: true, larvae: true };
	}
}

function useLarvalEntryMode(): LarvalInspectionEntryMode {
	// currentOrganization is an eager baseline collection, so suspense is safe.
	const result = useLiveSuspenseQuery(
		(query) => query.from({ organization: webCollections.currentOrganization }),
		[],
	);
	const organization = result.data[0];
	return resolveOrganizationSettings(organization?.settings).settings.larvalSurveillance
		.inspectionEntryPolicy.mode;
}

function useSpeciesName(speciesId: string): string {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ species: webCollections.species })
				.where(({ species }) => eq(species.id, speciesId))
				.findOne(),
		[speciesId],
	);

	return result.data?.displayName ?? 'Unknown species';
}

function useHabitatGeometry(habitatId: string, updatedAt: string) {
	return useQuery({
		// updatedAt is part of the key so a synced edit triggers a geometry refetch.
		queryKey: ['habitat-geometry', habitatId, updatedAt],
		queryFn: ({ signal }) => fetchHabitatGeometry(habitatId, signal),
		staleTime: Number.POSITIVE_INFINITY,
		// Keep the prior geometry visible while a new version refetches so an
		// unrelated edit does not flash the map back to a skeleton.
		placeholderData: (previous) => previous,
	});
}

async function fetchHabitatGeometry(
	habitatId: string,
	signal: AbortSignal,
): Promise<HabitatGeometry | null> {
	const url = new URL(`/map/habitats/${habitatId}`, getServerUrl());
	const response = await fetch(url, { credentials: 'include', signal });
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Habitat geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly habitat?: {
			readonly geojson?: unknown;
			readonly lat?: number;
			readonly lng?: number;
			readonly geomType?: string;
		};
	};
	const habitat = body.habitat;
	if (habitat === undefined) {
		return null;
	}

	return {
		geojson: (habitat.geojson ?? null) as GeoJsonGeometry | null,
		lat: habitat.lat ?? null,
		lng: habitat.lng ?? null,
		geomType: habitat.geomType ?? null,
	};
}

function HistoryEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[180px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

// Client-side paging over an already-loaded history slice. The current page is
// clamped when live sync shrinks the underlying data beneath it.
function usePagedRows<T>(rows: readonly T[], pageSize: number) {
	const [page, setPage] = useState(0);
	const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
	const safePage = Math.min(page, pageCount - 1);
	useEffect(() => {
		if (page !== safePage) {
			setPage(safePage);
		}
	}, [page, safePage]);

	const start = safePage * pageSize;
	return {
		page: safePage,
		pageCount,
		pageRows: rows.slice(start, start + pageSize),
		setPage,
	};
}

function HistoryPagination({
	page,
	pageCount,
	total,
	noun,
	onPageChange,
}: {
	readonly page: number;
	readonly pageCount: number;
	readonly total: number;
	readonly noun: string;
	readonly onPageChange: (page: number) => void;
}) {
	if (pageCount <= 1) {
		return (
			<p className="m-0 text-xs text-muted-foreground">
				{total} {noun}
			</p>
		);
	}

	const atStart = page === 0;
	const atEnd = page >= pageCount - 1;

	return (
		<div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
			<p className="m-0 text-xs text-muted-foreground">
				Page {page + 1} of {pageCount} · {total} {noun}
			</p>
			<Pagination className="mx-0 w-auto justify-end">
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious
							aria-disabled={atStart}
							className={atStart ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
							onClick={() => {
								if (!atStart) {
									onPageChange(page - 1);
								}
							}}
						/>
					</PaginationItem>
					{historyPageEntries(page, pageCount).map((entry) =>
						entry.page === null ? (
							<PaginationItem key={entry.key}>
								<PaginationEllipsis />
							</PaginationItem>
						) : (
							<PaginationItem key={entry.key}>
								<PaginationLink
									className="cursor-pointer"
									isActive={entry.page === page}
									onClick={() => onPageChange(entry.page as number)}
								>
									{entry.page + 1}
								</PaginationLink>
							</PaginationItem>
						),
					)}
					<PaginationItem>
						<PaginationNext
							aria-disabled={atEnd}
							className={atEnd ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
							onClick={() => {
								if (!atEnd) {
									onPageChange(page + 1);
								}
							}}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
}

interface HistoryPageEntry {
	readonly key: string;
	readonly page: number | null;
}

// First page, last page, and a window around the current page, with `null`
// sentinels marking the gaps that render as ellipses.
function historyPageEntries(page: number, pageCount: number): readonly HistoryPageEntry[] {
	const pages = new Set<number>([0, pageCount - 1]);
	for (let offset = -1; offset <= 1; offset += 1) {
		const candidate = page + offset;
		if (candidate >= 0 && candidate <= pageCount - 1) {
			pages.add(candidate);
		}
	}

	const sorted = [...pages].sort((first, second) => first - second);
	const entries: HistoryPageEntry[] = [];
	let previous = -1;
	for (const value of sorted) {
		if (previous !== -1 && value - previous > 1) {
			entries.push({ key: `gap-${previous}`, page: null });
		}
		entries.push({ key: `page-${value}`, page: value });
		previous = value;
	}
	return entries;
}

function HabitatDetailSkeleton() {
	return (
		<>
			<Skeleton className="h-8 w-64" />
			<div className="grid gap-5 lg:grid-cols-2">
				<Skeleton className="h-[460px]" />
				<DetailCardSkeleton />
			</div>
			<HistorySkeleton />
		</>
	);
}

function DetailCardSkeleton() {
	return (
		<Card variant="surface">
			<CardContent padding="default" className="grid gap-3">
				<Skeleton className="h-5 w-24" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-40 w-full" />
			</CardContent>
		</Card>
	);
}

function HistorySkeleton() {
	return (
		<Card variant="surface">
			<CardContent padding="default" className="grid gap-3">
				<Skeleton className="h-5 w-32" />
				<TableSkeleton rows={5} />
			</CardContent>
		</Card>
	);
}

function TableSkeleton({ rows }: { readonly rows: number }) {
	return (
		<div className="grid gap-2">
			{Array.from({ length: rows }, (_value, index) => index).map((index) => (
				<Skeleton className="h-9 w-full" key={index} />
			))}
		</div>
	);
}

function HabitatDetailUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Habitat unavailable</EmptyTitle>
				<EmptyDescription>
					This habitat could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function habitatName(habitat: HabitatRow): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
}

function habitatDescription(habitat: HabitatRow): string {
	return habitat.description.trim() || 'No description recorded.';
}

function sampleName(sample: HistorySample): string {
	return sample.displayName?.trim() || `Sample ${sample.id.slice(0, 8)}`;
}

function locationSummary(geometry: HabitatGeometry | null, isPending: boolean): string {
	if (isPending) {
		return 'Loading geometry…';
	}
	if (geometry === null || geometry.geojson === null) {
		return 'No geometry recorded';
	}
	return `${formatGeometryTypeLabel(geometry.geomType ?? '')} · ${coordinateLabel(geometry)}`;
}

function geometrySummary(geometry: HabitatGeometry | null, isPending: boolean): string {
	if (isPending) {
		return 'Loading…';
	}
	if (geometry === null || geometry.geojson === null) {
		return 'No geometry recorded';
	}
	return `${formatGeometryTypeLabel(geometry.geomType ?? '')} · ${countGeoJsonVertices(geometry.geojson)} vertices`;
}

function coordinateLabel(geometry: HabitatGeometry | null): string {
	if (geometry === null || geometry.lat === null || geometry.lng === null) {
		return 'Unknown coordinates';
	}

	return `${geometry.lat.toFixed(5)}, ${geometry.lng.toFixed(5)}`;
}

function formatSampleResult(sample: HistorySample): string {
	if (sample.isZeroLarvae) {
		return 'Zero larvae';
	}
	if (sample.unidentifiableReason !== null && sample.unidentifiableReason.trim().length > 0) {
		return 'Unidentifiable';
	}
	if (sample.hasNonMosquito) {
		return 'Non-mosquito present';
	}
	return 'Larvae present';
}

type LifeStageKey =
	| 'hasEggs'
	| 'hasFirstInstar'
	| 'hasSecondInstar'
	| 'hasThirdInstar'
	| 'hasFourthInstar'
	| 'hasPupae';

// Ordered egg -> instars -> pupae, rendered as a single "E1234P" strip.
const lifeStageSegments: readonly {
	readonly key: LifeStageKey;
	readonly symbol: string;
	readonly label: string;
}[] = [
	{ key: 'hasEggs', symbol: 'E', label: 'Eggs' },
	{ key: 'hasFirstInstar', symbol: '1', label: '1st instar' },
	{ key: 'hasSecondInstar', symbol: '2', label: '2nd instar' },
	{ key: 'hasThirdInstar', symbol: '3', label: '3rd instar' },
	{ key: 'hasFourthInstar', symbol: '4', label: '4th instar' },
	{ key: 'hasPupae', symbol: 'P', label: 'Pupae' },
];

// Read-only segmented indicator styled like a toggle group: each life stage is
// a fixed cell, highlighted when present and dimmed when absent, so the strip
// keeps a stable "E1234P" shape regardless of which stages were recorded.
function LifeStageStrip({ inspection }: { readonly inspection: HistoryInspection }) {
	const present = lifeStageSegments.filter((segment) => inspection[segment.key] === true);
	const ariaLabel =
		present.length === 0
			? 'No life stages recorded'
			: `Life stages present: ${present.map((segment) => segment.label).join(', ')}`;

	return (
		<div
			aria-label={ariaLabel}
			className="inline-flex overflow-hidden rounded-md border border-border"
			role="img"
		>
			{lifeStageSegments.map((segment, index) => {
				const isPresent = inspection[segment.key] === true;
				return (
					<span
						aria-hidden="true"
						className={cn(
							'flex size-6 items-center justify-center text-xs font-semibold tabular-nums',
							index > 0 && 'border-l border-border',
							isPresent
								? 'bg-primary text-primary-foreground'
								: 'bg-muted/40 text-muted-foreground/40',
						)}
						key={segment.key}
						title={segment.label}
					>
						{segment.symbol}
					</span>
				);
			})}
		</div>
	);
}

const densityBadges: Record<
	LarvalDensity,
	{ readonly label: string; readonly tone: 'neutral' | 'info' | 'warning' | 'danger' }
> = {
	none: { label: 'None', tone: 'neutral' },
	light: { label: 'Light', tone: 'info' },
	medium: { label: 'Medium', tone: 'warning' },
	heavy: { label: 'Heavy', tone: 'danger' },
	very_heavy: { label: 'Very heavy', tone: 'danger' },
};

function DensityBadge({ density }: { readonly density: LarvalDensity | null }) {
	if (density === null) {
		return <span className="text-muted-foreground">—</span>;
	}

	// very_heavy escalates to the solid destructive variant so it reads as more
	// severe than heavy, which there is no distinct second danger tone for.
	if (density === 'very_heavy') {
		return <Badge variant="destructive">{densityBadges[density].label}</Badge>;
	}

	const { label, tone } = densityBadges[density];
	return (
		<Badge variant="outline" tone={tone}>
			{label}
		</Badge>
	);
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

function toMetadataEntries(metadata: unknown): readonly (readonly [string, string])[] {
	if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return [];
	}

	return Object.entries(metadata as Record<string, unknown>)
		.filter(([, value]) => value !== null && value !== undefined)
		.map(([key, value]) => [key, formatMetadataValue(value)] as const);
}

function formatMetadataValue(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return JSON.stringify(value);
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

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(date);
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
