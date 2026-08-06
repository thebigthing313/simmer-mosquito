import {
	type LarvalInspectionEntryMode,
	resolveOrganizationSettings,
} from '@simmer-mosquito/domain';
import {
	countGeoJsonVertices,
	formatGeometryTypeLabel,
	type GeoJsonGeometry,
} from '@simmer-mosquito/mapping';
import type { HabitatRow, LarvalDensity, TagRow } from '@simmer-mosquito/sync';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
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
} from '@simmer-mosquito/ui-web/icons/registry';
import { and, eq, toArray, useLiveQuery, useLiveSuspenseQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { type CSSProperties, type ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import { useBreadcrumbLabel } from '../components/app-shell';
import { CommentsSection } from '../components/comments-section';
import { DangerZoneCard } from '../components/danger-zone-card';
import { EmptyValue } from '../components/empty-value';
import { DensityBadge, LifeStageStrip } from '../components/larval-display';
import { LinkedAddressValue } from '../components/linked-address';
import { RecordLocationCard } from '../components/map/record-location-card';
import { WriteOnly } from '../components/write-only';
import {
	customFieldEntries,
	customSchemaFor,
	formatCustomFieldValue,
} from '../forms/field-components';
import { useHabitatGeometry } from '../hooks/use-habitat-geometry';
import { hexWithAlpha, validHexColor } from '../lib/hex-color';
import { webCollections } from '../sync/webCollections';
import type { HabitatGeometry } from './-habitat-geometry-cache';
import { HabitatInspectionStats } from './-habitat-inspection-stats';

const historyPageSize = 25;
// Keep the on-demand inspection/sample/species subsets warm briefly after unmount
// so quick navigation between habitats reuses them instead of refetching them.
const historyGcTimeMs = 30_000;
// Same rationale for the on-demand tag_items subset behind the Details "Tags" row.
const tagsGcTimeMs = 30_000;

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

// Applications are scoped to the habitat directly (application.habitatId), so they
// surface here as a sibling of inspections — including any not tied to a specific
// inspection — rather than nested under the inspection includes.
interface HistoryApplication {
	readonly id: string;
	readonly applicationDate: string;
	readonly applicatorProfileId: string | null;
	readonly insecticideId: string;
	readonly applicationMethodId: string | null;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
}

// The larval-surveillance explorer is the only habitats index, so "Back to
// habitats" always returns there.
type HabitatDetailBackTo = '/larval-surveillance/habitats';

interface HabitatDetailProps {
	readonly habitatId: string;
	readonly backTo?: HabitatDetailBackTo;
}

export function HabitatDetail({
	habitatId,
	backTo = '/larval-surveillance/habitats',
}: HabitatDetailProps) {
	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'trailing' })}>
				<div className="flex items-center justify-between gap-3">
					<Link
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
						to={backTo}
					>
						<ArrowLeftIcon aria-hidden="true" />
						Back to habitats
					</Link>
					{backTo === '/larval-surveillance/habitats' ? (
						<WriteOnly>
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: habitatId }} to="/larval-surveillance/habitats/$id/edit">
									Edit Habitat
								</Link>
							</Button>
						</WriteOnly>
					) : null}
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
	// Surface the habitat's name in the breadcrumb trail in place of its uuid.
	useBreadcrumbLabel(habitat.id, habitatName(habitat));

	// Geometry is not part of the Electric shape (ADR 0009), so it is fetched from
	// the server display endpoint. Keying on updatedAt makes it refetch whenever
	// the synced record changes, keeping the map in step with edits.
	const { data: geometry, isPending: isGeometryPending } = useHabitatGeometry(habitat.id);
	const resolvedGeometry = geometry ?? null;

	return (
		<>
			<HabitatDetailHeader habitat={habitat} />
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
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
					<DangerZoneCard
						name={habitatName(habitat)}
						noun="habitat"
						onDelete={() => webCollections.habitats.delete(habitat.id)}
						recordId={habitat.id}
						recordType="habitat"
						returnTo="/larval-surveillance/habitats"
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<HabitatInspectionStats habitatId={habitat.id} />
					<CommentsSection
						description="Field notes, access details, and status updates for this habitat."
						target={{ type: 'habitat', id: habitat.id }}
					/>
				</div>
			</div>
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
	const geojson = (geometry?.geojson ?? null) as GeoJsonGeometry | null;
	return (
		<RecordLocationCard
			description={locationSummary(geometry, isPending)}
			emptyDescription="This habitat has no location to display."
			geojson={geojson}
			geomType={geometry?.geomType ?? null}
			height="h-[380px]"
			isPending={isPending}
		/>
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
						<LinkedAddressValue addressId={habitat.addressId} />
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
				<Suspense fallback={null}>
					<HabitatMetadata habitatTypeId={habitat.habitatTypeId} metadata={habitat.metadata} />
				</Suspense>
			</CardContent>
		</Card>
	);
}

/**
 * The habitat's metadata, read through its type's custom schema so declared fields
 * get their configured label and order (and yes/no fields read as words). Values
 * the schema no longer declares still render, so history is never hidden.
 */
function HabitatMetadata({
	habitatTypeId,
	metadata,
}: {
	readonly habitatTypeId: string | null;
	readonly metadata: unknown;
}) {
	const schema = useHabitatTypeSchema(habitatTypeId);
	const entries = useMemo(() => customFieldEntries(schema, metadata), [schema, metadata]);
	if (entries.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1.5">
			<span className="text-xs font-semibold text-muted-foreground uppercase">Metadata</span>
			<dl className="grid gap-1.5">
				{entries.map((entry) => (
					<DetailRow key={entry.key} label={entry.label}>
						{formatCustomFieldValue(entry) ?? <EmptyValue />}
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

	// Re-sort client-side: the query's orderBy is applied before the correlated
	// `toArray` samples subquery, and TanStack DB emits the joined result in key
	// order rather than the requested order — so establish most-recent-first here.
	const inspections = useMemo(() => {
		const rows = (result.data ?? []) as unknown as readonly HistoryInspection[];
		return [...rows].sort((a, b) => (a.inspectionDate < b.inspectionDate ? 1 : -1));
	}, [result.data]);
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

	// Applications correlate to the habitat directly, so they load as their own
	// on-demand live query alongside inspections (same gcTime + status-gated
	// pattern), not as a nested include under the inspection rows.
	const applicationsResult = useLiveQuery(
		{
			gcTime: historyGcTimeMs,
			query: (query) =>
				query
					.from({ application: webCollections.applications })
					.where(({ application }) => eq(application.habitatId, habitatId))
					.orderBy(({ application }) => application.applicationDate, 'desc')
					.select(({ application }) => ({
						id: application.id,
						applicationDate: application.applicationDate,
						applicatorProfileId: application.applicatorProfileId,
						insecticideId: application.insecticideId,
						applicationMethodId: application.applicationMethodId,
						amountApplied: application.amountApplied,
						applicationUnitId: application.applicationUnitId,
					})),
		},
		[habitatId],
	);
	const applications = (applicationsResult.data ?? []) as unknown as readonly HistoryApplication[];

	const isError = result.isError;
	// Hold the tabs behind a skeleton until both on-demand subsets settle so the
	// Applications tab count isn't briefly wrong; an applications-only failure is
	// surfaced inside its own tab rather than blanking the whole card.
	const applicationsSettled = applicationsResult.isReady || applicationsResult.isError;
	const isReady = result.isReady && applicationsSettled;

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>History</CardTitle>
				<CardDescription>
					Recent larval inspections, samples, and applications for this habitat.
				</CardDescription>
			</CardHeader>
			<CardContent padding="compact">
				{isError ? (
					<HistoryEmpty
						title="History Unavailable"
						description="Inspection and sample history could not be loaded."
					/>
				) : isReady ? (
					<Tabs defaultValue="inspections">
						<TabsList>
							<TabsTrigger value="inspections">Inspections ({inspections.length})</TabsTrigger>
							<TabsTrigger value="samples">Samples ({samples.length})</TabsTrigger>
							<TabsTrigger value="applications">Applications ({applications.length})</TabsTrigger>
						</TabsList>
						<TabsContent value="inspections" className="pt-4">
							<InspectionHistory inspections={inspections} />
						</TabsContent>
						<TabsContent value="samples" className="pt-4">
							<SampleHistory samples={samples} />
						</TabsContent>
						<TabsContent value="applications" className="pt-4">
							{applicationsResult.isError ? (
								<HistoryEmpty
									title="Applications Unavailable"
									description="Application history could not be loaded."
								/>
							) : (
								<ApplicationHistory applications={applications} />
							)}
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
				title="No Inspections Yet"
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
									<LifeStageStrip stages={inspection} />
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
				title="No Samples Yet"
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
							<TableHead>Inspection Date</TableHead>
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

function ApplicationHistory({
	applications,
}: {
	readonly applications: readonly HistoryApplication[];
}) {
	const { page, pageCount, pageRows, setPage } = usePagedRows(applications, historyPageSize);

	if (applications.length === 0) {
		return (
			<HistoryEmpty
				title="No Applications Yet"
				description="Control applications recorded on this habitat will show here."
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
							<TableHead>Applicator</TableHead>
							<TableHead>Insecticide</TableHead>
							<TableHead>Method</TableHead>
							<TableHead className="text-right">Amount</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{pageRows.map((application) => (
							<TableRow key={application.id}>
								<TableCell className="whitespace-nowrap">
									{formatDate(application.applicationDate)}
								</TableCell>
								<TableCell className="whitespace-nowrap">
									{application.applicatorProfileId === null ? (
										<span className="text-muted-foreground">—</span>
									) : (
										<Suspense fallback={<span className="text-muted-foreground">…</span>}>
											<ProfileName profileId={application.applicatorProfileId} />
										</Suspense>
									)}
								</TableCell>
								<TableCell>
									<Suspense fallback={<span className="text-muted-foreground">…</span>}>
										<InsecticideName insecticideId={application.insecticideId} />
									</Suspense>
								</TableCell>
								<TableCell>
									<Suspense fallback={<span className="text-muted-foreground">…</span>}>
										<ApplicationMethodName applicationMethodId={application.applicationMethodId} />
									</Suspense>
								</TableCell>
								<TableCell className="text-right tabular-nums">
									<Suspense fallback={<span className="text-muted-foreground">…</span>}>
										<ApplicationAmount
											amount={application.amountApplied}
											unitId={application.applicationUnitId}
										/>
									</Suspense>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</ScrollArea>
			<HistoryPagination
				noun="applications"
				onPageChange={setPage}
				page={page}
				pageCount={pageCount}
				total={applications.length}
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

// insecticides, units, and application methods are eager baseline collections, so
// suspense is safe — unlike the on-demand applications subset they decorate.
function InsecticideName({ insecticideId }: { readonly insecticideId: string }) {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ insecticide: webCollections.insecticides })
				.where(({ insecticide }) => eq(insecticide.id, insecticideId))
				.findOne(),
		[insecticideId],
	);

	return <>{result.data?.tradeName ?? 'Unknown insecticide'}</>;
}

function ApplicationMethodName({
	applicationMethodId,
}: {
	readonly applicationMethodId: string | null;
}) {
	const result = useLiveSuspenseQuery(
		(query) => query.from({ method: webCollections.applicationMethods }),
		[],
	);

	if (applicationMethodId === null) {
		return <EmptyValue />;
	}

	const match = result.data.find((method) => method.id === applicationMethodId);
	return <>{match?.name ?? 'Unknown method'}</>;
}

function ApplicationAmount({
	amount,
	unitId,
}: {
	readonly amount: number;
	readonly unitId: string;
}) {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ unit: webCollections.units })
				.where(({ unit }) => eq(unit.id, unitId))
				.findOne(),
		[unitId],
	);

	const abbreviation = result.data?.abbreviation ?? '';
	return (
		<>
			{formatAmount(amount)}
			{abbreviation === '' ? null : ` ${abbreviation}`}
		</>
	);
}

function useHabitatTypeSchema(habitatTypeId: string | null): unknown {
	const result = useLiveSuspenseQuery(
		(query) => query.from({ habitatType: webCollections.habitatTypes }),
		[],
	);
	return customSchemaFor(result.data, habitatTypeId);
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
				<EmptyTitle>Habitat Unavailable</EmptyTitle>
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
	if (geometry == null || geometry.geojson == null) {
		return 'No geometry recorded';
	}
	return `${formatGeometryTypeLabel(geometry.geomType ?? '')} · ${coordinateLabel(geometry)}`;
}

function geometrySummary(geometry: HabitatGeometry | null, isPending: boolean): string {
	if (isPending) {
		return 'Loading…';
	}
	if (geometry == null || geometry.geojson == null) {
		return 'No geometry recorded';
	}
	return `${formatGeometryTypeLabel(geometry.geomType ?? '')} · ${countGeoJsonVertices(geometry.geojson)} vertices`;
}

function coordinateLabel(geometry: HabitatGeometry | null): string {
	if (geometry == null || typeof geometry.lat !== 'number' || typeof geometry.lng !== 'number') {
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

// Trim trailing zeros from stored decimals (e.g. 2.50 -> 2.5) while keeping whole
// amounts whole, so applied quantities read naturally next to their unit.
function formatAmount(value: number): string {
	if (!Number.isFinite(value)) {
		return '—';
	}

	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
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
