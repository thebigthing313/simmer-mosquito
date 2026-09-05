import type { LarvalInspectionEntryMode } from '@simmer-mosquito/domain';
import {
	countGeoJsonVertices,
	formatGeometryTypeLabel,
	type GeoJsonGeometry,
} from '@simmer-mosquito/mapping';
import { customFieldEntries, customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
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
	CheckCircle2Icon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { type CSSProperties, type ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import type { AskAcknowledged } from '../components/acknowledged-write';
import { useBreadcrumbLabel } from '../components/app-shell';
import { CommentsSection } from '../components/comments-section';
import { CustomFieldsList } from '../components/custom-fields-card';
import { DangerZoneCard } from '../components/danger-zone-card';
import { EmptyValue } from '../components/empty-value';
import { ExplorerPagination } from '../components/explorer-pagination';
import { DensityBadge, LifeStageStrip } from '../components/larval-display';
import { LinkedAddressValueById } from '../components/linked-address';
import { RecordLocationCard } from '../components/map/record-location-card';
import { RecordRegionsBand } from '../components/map/record-regions-band';
import {
	RecordDetailColumns,
	type RecordDetailLayout,
	RecordDetailPage,
	RecordDetailSkeleton,
	RecordUnavailable,
} from '../components/record';
import { WriteOnly } from '../components/write-only';
import { useHabitatMutations } from '../hooks/mutations/use-habitat-mutations';
import type { Habitat } from '../hooks/queries/habitat-view';
import type { Tag } from '../hooks/queries/tag-view';
import {
	useApplicationMethodRoster,
	useHabitatTypeRoster,
} from '../hooks/queries/use-catalog-rosters';
import {
	type HabitatHistoryApplication,
	type HabitatHistoryInspection,
	type HabitatHistorySample,
	type HabitatHistorySampleRow,
	type HabitatHistorySpecies,
	useHabitatHistory,
} from '../hooks/queries/use-habitat-history';
import { useHabitatSuspense } from '../hooks/queries/use-habitat-suspense';
import { useInsecticideRecords } from '../hooks/queries/use-insecticide-records';
import { useOrganizationSettings } from '../hooks/queries/use-organization-settings';
import { useProfileNames } from '../hooks/queries/use-profile-names';
import { useRecordRoutes } from '../hooks/queries/use-record-routes';
import { useRecordTags } from '../hooks/queries/use-record-tags';
import { useSpeciesNames } from '../hooks/queries/use-species-names';
import { useUnitLabels } from '../hooks/queries/use-unit-labels';
import { useHabitatGeometry } from '../hooks/use-habitat-geometry';
import { useOrganizationTimeZone } from '../hooks/use-organization-time-zone';
import { HABITAT_DELETE_REFUSALS } from '../lib/acknowledgement-copy';
import { hexWithAlpha, validHexColor } from '../lib/hex-color';
import type { HabitatGeometry } from './-habitat-geometry-cache';
import { HabitatInspectionStats } from './-habitat-inspection-stats';

const historyPageSize = 25;
// The larval-surveillance explorer is the only habitats index, so "Back to
// habitats" always returns there.
type HabitatDetailBackTo = '/larval-surveillance/habitats';

interface HabitatDetailProps {
	readonly habitatId: string;
	readonly backTo?: HabitatDetailBackTo;
}

const MergeIcon = iconRegistry.actions.merge.icon;

/**
 * The habitat's readiness is a Suspense boundary rather than a flag, so this
 * page hands the frame a body. The placeholder is still the frame's, and so is
 * the unavailable state — the loader below reports it, because nothing outside
 * a suspended tree can find out there is no record.
 */
const layout: RecordDetailLayout = {
	aside: 'wide',
	padding: 'trailing',
	stickyAside: true,
	skeleton: {
		title: 'w-64',
		main: [['h-[460px]', 'h-[460px]'], 'h-64'],
		aside: ['h-96'],
	},
};

export function HabitatDetail({
	habitatId,
	backTo = '/larval-surveillance/habitats',
}: HabitatDetailProps) {
	return (
		<RecordDetailPage
			actions={
				backTo === '/larval-surveillance/habitats' ? (
					<>
						{/*
						 * Merging is reached from a habitat rather than from a list of
						 * proposals, because two records for one catch basin agree about
						 * nothing except where they are. The habitat somebody is already
						 * looking at is the one that survives, which is the choice a
						 * cleanup page has to make with a radio and get wrong in silence.
						 */}
						<WriteOnly minimum="manager">
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: habitatId }} to="/larval-surveillance/habitats/$id/merge">
									<MergeIcon aria-hidden="true" />
									Merge duplicates
								</Link>
							</Button>
						</WriteOnly>
						<WriteOnly>
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: habitatId }} to="/larval-surveillance/habitats/$id/edit">
									Edit Habitat
								</Link>
							</Button>
						</WriteOnly>
					</>
				) : undefined
			}
			back={{ label: 'Back to habitats', to: backTo }}
			body={(askDelete) => (
				<Suspense fallback={<RecordDetailSkeleton layout={layout} />}>
					<HabitatDetailLoader askDelete={askDelete} habitatId={habitatId} />
				</Suspense>
			)}
			deleteRefusals={HABITAT_DELETE_REFUSALS}
			layout={layout}
			noun="habitat"
		/>
	);
}

function HabitatDetailLoader({
	habitatId,
	askDelete,
}: {
	readonly habitatId: string;
	readonly askDelete: AskAcknowledged;
}) {
	// Record fields stream live from the synced (on-demand) habitats collection,
	// so detail edits propagate without a manual refetch.
	const habitat = useHabitatSuspense(habitatId);

	if (habitat === undefined) {
		return <RecordUnavailable noun="habitat" reason="not-found" />;
	}

	return <HabitatDetailContent askDelete={askDelete} habitat={habitat} />;
}

function HabitatDetailContent({
	habitat,
	askDelete,
}: {
	readonly habitat: Habitat;
	readonly askDelete: AskAcknowledged;
}) {
	// Surface the habitat's name in the breadcrumb trail in place of its uuid.
	useBreadcrumbLabel(habitat.id, habitat.name);

	// Geometry is not part of the Electric shape (ADR 0009), so it is fetched from
	// the server display endpoint. Keying on updatedAt makes it refetch whenever
	// the synced record changes, keeping the map in step with edits.
	const { data: geometry, isPending: isGeometryPending } = useHabitatGeometry(habitat.id);
	const resolvedGeometry = geometry ?? null;
	const mutations = useHabitatMutations();

	return (
		<RecordDetailColumns
			aside={
				<>
					<HabitatInspectionStats habitatId={habitat.id} />
					<CommentsSection
						description="Field notes, access details, and status updates for this habitat."
						target={{ type: 'habitat', id: habitat.id }}
					/>
				</>
			}
			header={<HabitatDetailHeader habitat={habitat} />}
			layout={layout}
		>
			{/* The only page whose map card is half the main column, so the band
			    goes under the pair rather than inside the left half: the spec
			    puts it at the full width of the main column, and at 328px a
			    folder row wraps where six chips are meant to fit on one line. */}
			<div className="grid gap-5 lg:grid-cols-2">
				<HabitatLocationCard geometry={resolvedGeometry} isPending={isGeometryPending} />
				<HabitatDetailsCard
					geometry={resolvedGeometry}
					habitat={habitat}
					isGeometryPending={isGeometryPending}
				/>
			</div>
			<RecordRegionsBand noun="habitat" recordId={habitat.id} recordType="habitats" />
			<Suspense fallback={<HistorySkeleton />}>
				<HabitatHistoryCard habitatId={habitat.id} />
			</Suspense>
			<DangerZoneCard
				ask={askDelete}
				name={habitat.name}
				noun="habitat"
				onDelete={(acknowledgements) => mutations.remove(habitat.id, acknowledgements)}
				recordId={habitat.id}
				recordType="habitat"
				returnTo="/larval-surveillance/habitats"
			/>
		</RecordDetailColumns>
	);
}

function HabitatDetailHeader({ habitat }: { readonly habitat: Habitat }) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid gap-1">
				<h1 className="m-0 text-[1.5rem] leading-tight font-semibold text-foreground">
					{habitat.name}
				</h1>
				<Suspense fallback={<span className="text-sm text-muted-foreground">Loading type…</span>}>
					<HabitatTypeLabel habitatTypeId={habitat.typeId} />
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

function HabitatStateBadges({ habitat }: { readonly habitat: Habitat }) {
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
	readonly habitat: Habitat;
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
							<HabitatTypeLabel habitatTypeId={habitat.typeId} />
						</Suspense>
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={habitat.addressId} />
					</DetailRow>
					<DetailRow label="Tags">
						<Suspense fallback={<span className="text-muted-foreground">Loading tags…</span>}>
							<HabitatTags habitatId={habitat.id} />
						</Suspense>
					</DetailRow>
					<DetailRow label="Routes">
						<Suspense fallback={<span className="text-muted-foreground">Loading routes…</span>}>
							<HabitatRoutes habitatId={habitat.id} />
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
					<HabitatMetadata habitatTypeId={habitat.typeId} metadata={habitat.metadata} />
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
			{/* The same list every other record's custom fields render through, so an
			    organization-authored label wraps here too rather than being clipped
			    by the curated-label column `DetailRow` above is sized for. */}
			<CustomFieldsList entries={entries} />
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

function AuditValue({
	at,
	profileId,
}: {
	readonly at: string | Date;
	readonly profileId: string | null;
}) {
	const timeZone = useOrganizationTimeZone();
	return (
		<span>
			{formatDateTime(at, timeZone)}
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
	// One query, joined to the catalog, so a tag arrives named and coloured — and
	// `tag_items.entity_id` is globally unique, so no entity type is needed. See
	// `use-record-tags.ts`.
	const tags = useRecordTags(habitatId);

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

/**
 * The routes this habitat is a stop on.
 *
 * `docs/sync.md` notes that "the same habitat may appear in multiple routes",
 * which is exactly why the detail page should say so: a crew lead looking at a
 * site needs to know whose run it is already on before adding it to another,
 * and until now the only way to find out was to open every route.
 *
 * Same shape as `HabitatTags` and for the same reason: `route_items` is
 * on-demand, so this is a non-suspense `useLiveQuery` gated on status rather
 * than `useLiveSuspenseQuery`, which hangs permanently after unmount over an
 * on-demand collection. `routes` is eager, so suspense is safe there.
 */
function HabitatRoutes({ habitatId }: { readonly habitatId: string }) {
	const { routes, isReady, isError } = useRecordRoutes({ type: 'habitat', id: habitatId });

	if (isError) {
		return <span className="text-muted-foreground">Routes unavailable</span>;
	}
	if (!isReady) {
		return <span className="text-muted-foreground">Loading routes…</span>;
	}
	if (routes.length === 0) {
		return <span className="text-muted-foreground">Not on a route</span>;
	}

	return (
		<ul className="m-0 grid list-none gap-1 p-0">
			{routes.map(({ position, routeId, routeItemId, routeName }) => (
				<li className="flex items-baseline gap-2" key={routeItemId}>
					<Link
						className="w-fit rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						params={{ id: routeId }}
						to="/larval-surveillance/habitats/routes/$id"
					>
						{routeName}
					</Link>
					{/* Where in the run it falls — the thing a crew lead is actually
					    asking when they ask which route a site is on. */}
					<span className="text-muted-foreground text-xs tabular-nums">stop {position}</span>
				</li>
			))}
		</ul>
	);
}

function TagBadge({ tag }: { readonly tag: Tag }) {
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
			{tag.name}
		</Badge>
	);
}

function HabitatHistoryCard({ habitatId }: { readonly habitatId: string }) {
	const { inspections, samples, applications, isReady, isError, isApplicationsError } =
		useHabitatHistory(habitatId);

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
							{isApplicationsError ? (
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
	readonly inspections: readonly HabitatHistoryInspection[];
}) {
	const { page, pageCount, pageRows, setPage } = usePagedRows(inspections, historyPageSize);
	// The organization's larval data mode decides which abundance columns are
	// meaningful: density-only entry hides larvae, count-and-dips entry hides the
	// derived density, and hybrid shows all three.
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
			<ExplorerPagination
				noun={{ one: 'inspection', many: 'inspections' }}
				onPageChange={setPage}
				page={page}
				pageCount={pageCount}
				total={inspections.length}
			/>
		</div>
	);
}

function SampleHistory({ samples }: { readonly samples: readonly HabitatHistorySampleRow[] }) {
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
			<ExplorerPagination
				noun={{ one: 'sample', many: 'samples' }}
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
	readonly applications: readonly HabitatHistoryApplication[];
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
			<ExplorerPagination
				noun={{ one: 'application', many: 'applications' }}
				onPageChange={setPage}
				page={page}
				pageCount={pageCount}
				total={applications.length}
			/>
		</div>
	);
}

function SampleSpeciesSummary({ species }: { readonly species: readonly HabitatHistorySpecies[] }) {
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

function SampleSpeciesChip({ row }: { readonly row: HabitatHistorySpecies }) {
	const speciesName = useSpeciesName(row.speciesId);
	return (
		<Badge variant="outline" tone="neutral">
			{speciesName}
			<span className="tabular-nums">{row.larvaeCount}</span>
		</Badge>
	);
}

/**
 * One eager read of the whole roster rather than a subset per name rendered.
 * Profiles number in the tens and every row on this page names an actor, so a
 * query each would be dozens of identical suspending reads for one small table.
 */
function ProfileName({ profileId }: { readonly profileId: string }) {
	return <>{useProfileNames().get(profileId) ?? 'Unknown'}</>;
}

// insecticides, units, and application methods are eager baseline collections, so
// suspense is safe — unlike the on-demand applications subset they decorate.
function InsecticideName({ insecticideId }: { readonly insecticideId: string }) {
	const match = useInsecticideRecords().find((product) => product.id === insecticideId);
	return <>{match?.tradeName ?? 'Unknown insecticide'}</>;
}

function ApplicationMethodName({
	applicationMethodId,
}: {
	readonly applicationMethodId: string | null;
}) {
	const methods = useApplicationMethodRoster();

	if (applicationMethodId === null) {
		return <EmptyValue />;
	}

	const match = methods.find((method) => method.id === applicationMethodId);
	return <>{match?.name ?? 'Unknown method'}</>;
}

function ApplicationAmount({
	amount,
	unitId,
}: {
	readonly amount: number;
	readonly unitId: string;
}) {
	const abbreviation = useUnitLabels().byId.get(unitId)?.abbreviation ?? '';
	return (
		<>
			{formatAmount(amount)}
			{abbreviation === '' ? null : ` ${abbreviation}`}
		</>
	);
}

function useHabitatTypeSchema(habitatTypeId: string | null): unknown {
	return customSchemaFor(useHabitatTypeRoster(), habitatTypeId);
}

function useHabitatTypeName(habitatTypeId: string | null): string {
	const habitatTypes = useHabitatTypeRoster();

	if (habitatTypeId === null) {
		return 'Unassigned type';
	}

	const match = habitatTypes.find((habitatType) => habitatType.id === habitatTypeId);
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
	return useOrganizationSettings().larvalSurveillance.inspectionEntryPolicy.mode;
}

/** One id through the shared taxonomy read — the catalog is eager and small. */
function useSpeciesName(speciesId: string): string {
	return useSpeciesNames().get(speciesId) ?? 'Unknown species';
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

function habitatDescription(habitat: Habitat): string {
	return habitat.description.trim() || 'No description recorded.';
}

function sampleName(sample: HabitatHistorySample): string {
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

function formatSampleResult(sample: HabitatHistorySample): string {
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

/**
 * A calendar-date column — an inspection date, an application date — as itself.
 *
 * These are days, not instants, and reading one with `new Date` made it one: a
 * bare `YYYY-MM-DD` parses as UTC midnight, which renders as the *previous* day
 * everywhere west of Greenwich. So the parts are read out and put back together
 * in UTC, where the day cannot move.
 */
function formatDate(value: string): string {
	const parts = value.slice(0, 10).split('-');
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (!(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(year, month - 1, day)));
}

// Trim trailing zeros from stored decimals (e.g. 2.50 -> 2.5) while keeping whole
// amounts whole, so applied quantities read naturally next to their unit.
function formatAmount(value: number): string {
	if (!Number.isFinite(value)) {
		return '—';
	}

	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

/**
 * A stamp, in the organization's zone.
 *
 * Takes a `Date` as well as a string: the read seam hands back `created_at` and
 * `updated_at` as `Date` — `coerce.date()` in the row schema — where the row
 * type this page used to hold spelled them as ISO strings. Accepting both is
 * what keeps the two remaining string call sites working while the surfaces
 * around this one still speak the old shape.
 */
function formatDateTime(value: string | Date, timeZone: string | undefined): string {
	const date = value instanceof Date ? value : new Date(value);
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
