import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { ControlType, LarvalDensity } from '@simmer-mosquito/sync';
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
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, CalendarIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, toArray, useLiveQuery, useLiveSuspenseQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, Suspense, useMemo } from 'react';
import { getServerUrl } from '../../../auth';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import {
	DensityBadge,
	hasAnyLifeStage,
	LifeStageStrip,
	larvaePerDip,
	WetnessBadge,
} from '../../../components/larval-display';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useProfileNames } from '../../../hooks/queries/use-profile-names';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { adhocLabel } from '../../../lib/coordinate-label';
import { webCollections } from '../../../sync/webCollections';

export const Route = createFileRoute('/larval-surveillance/inspections/$id')({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <InspectionDetail inspectionId={id} />;
}

const InspectionIcon = iconRegistry.entities.inspection.icon;
const SampleIcon = iconRegistry.entities.sample.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;
const HabitatIcon = iconRegistry.simmer.fieldWork.icon;
const ControlIcon = iconRegistry.domains.controlOperations.icon;
const EditIcon = iconRegistry.actions.edit.icon;

// The inspection samples/species/linked-action subsets stream from on-demand
// collections; keep them warm briefly after unmount so returning reuses them.
const samplesGcTimeMs = 30_000;
const linkedActionsGcTimeMs = 30_000;

/**
 * The `/map/inspections/:id` display projection: the owned-geometry columns plus
 * the record fields and the joined habitat / address / inspector labels. This is
 * the single source for the header, map, findings, and context — an inspection is
 * not editable in v1, so a one-shot fetch (which also bundles the geometry Electric
 * omits, ADR 0009) is simpler than reassembling the record from synced collections.
 */
interface InspectionDetailRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geojson: GeoJsonGeometry | null;
	readonly geomType: string | null;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly addressDisplayName: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectedByName: string | null;
	readonly inspectionDate: string;
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
	readonly createdAt: string;
	readonly updatedAt: string;
}

// Projected shapes of the nested includes query (sample -> species).
interface SampleSpeciesEntry {
	readonly id: string;
	readonly speciesId: string;
	readonly larvaeCount: number;
}

interface SampleEntry {
	readonly id: string;
	readonly displayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly species: readonly SampleSpeciesEntry[];
}

function InspectionDetail({ inspectionId }: { readonly inspectionId: string }) {
	const query = useInspectionDetail(inspectionId);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'trailing' })}>
				<InspectionTopBar habitatId={query.data?.habitatId ?? null} />
				{query.isPending ? (
					<InspectionDetailSkeleton />
				) : query.isError || query.data == null ? (
					<RecordUnavailable noun="inspection" reason="not-found" />
				) : (
					<InspectionDetailContent inspection={query.data} />
				)}
			</div>
		</div>
	);
}

function InspectionTopBar({ habitatId }: { readonly habitatId: string | null }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<Link
				className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
				to="/larval-surveillance/inspections"
			>
				<ArrowLeftIcon aria-hidden="true" />
				Back to inspections
			</Link>
			{habitatId === null ? null : (
				<Button asChild size="sm" variant="outline">
					<Link params={{ id: habitatId }} to="/larval-surveillance/habitats/$id">
						<HabitatIcon aria-hidden="true" />
						View habitat
					</Link>
				</Button>
			)}
		</div>
	);
}

function InspectionDetailContent({ inspection }: { readonly inspection: InspectionDetailRow }) {
	// Surface the inspection date in the breadcrumb trail in place of its uuid.
	useBreadcrumbLabel(inspection.id, breadcrumbLabel(inspection));

	return (
		<>
			<InspectionHeader inspection={inspection} />
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<InspectionLocationCard geometry={inspection.geojson} geomType={inspection.geomType} />
					<InspectionSamplesCard inspectionId={inspection.id} isWet={inspection.isWet} />
					<LinkedControlActionsCard inspectionId={inspection.id} />
					<DangerZoneCard
						name={breadcrumbLabel(inspection)}
						noun="inspection"
						onDelete={() => webCollections.inspections.delete(inspection.id)}
						recordId={inspection.id}
						recordType="inspection"
						returnTo="/larval-surveillance/inspections"
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<ContextCard inspection={inspection} />
					<CommentsSection
						description="Access notes, conditions, and follow-up for this inspection."
						target={{ type: 'inspection', id: inspection.id }}
					/>
				</div>
			</div>
		</>
	);
}

function InspectionHeader({ inspection }: { readonly inspection: InspectionDetailRow }) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid gap-1.5">
				<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
					<InspectionIcon aria-hidden="true" className="size-3.5" />
					Larval inspection
				</span>
				<h1 className="m-0 flex items-center gap-2 font-semibold text-[1.5rem] text-foreground leading-tight">
					<CalendarIcon aria-hidden="true" className="size-5 text-muted-foreground" />
					{formatFullDate(inspection.inspectionDate)}
				</h1>
				<InspectionSubtitle inspection={inspection} />
				{/*
				 * The result belongs to the record's identity — what this inspection
				 * found is the last line of what it *is*, under the date and the site.
				 * It sits in the header stack rather than in a band of its own so it
				 * takes the width of what it holds; a full-page strip carrying six
				 * cells and a short sentence was the same complaint turned sideways.
				 */}
				<FindingsLine inspection={inspection} />
			</div>
			<WriteOnly>
				<Button asChild size="sm" variant="outline">
					<Link params={{ id: inspection.id }} to="/larval-surveillance/inspections/$id/edit">
						<EditIcon aria-hidden="true" />
						Edit
					</Link>
				</Button>
			</WriteOnly>
		</div>
	);
}

function InspectionSubtitle({ inspection }: { readonly inspection: InspectionDetailRow }) {
	if (inspection.habitatId === null) {
		return (
			<p className="m-0 text-[0.95rem] text-muted-foreground">
				<span className="tabular-nums">{adhocLabel(inspection.lat, inspection.lng)}</span>
				{inspection.addressDisplayName === null ? null : ` · ${inspection.addressDisplayName}`}
			</p>
		);
	}

	return (
		<p className="m-0 inline-flex flex-wrap items-center gap-1.5 text-[0.95rem] text-muted-foreground">
			<span>at</span>
			<Link
				className="rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
				params={{ id: inspection.habitatId }}
				to="/larval-surveillance/habitats/$id"
			>
				{siteLabel(inspection)}
			</Link>
			<span aria-hidden="true">·</span>
			<Suspense fallback={<span>Loading type…</span>}>
				<HabitatTypeName habitatTypeId={inspection.habitatTypeId} />
			</Suspense>
		</p>
	);
}

/** A single "larvae found / none found" pill, meaningful only for wet inspections. */
function PositivityBadge({ inspection }: { readonly inspection: InspectionDetailRow }) {
	if (!inspection.isWet) {
		return null;
	}
	return hasAnyLifeStage(inspection) ? (
		<Badge tone="danger" variant="outline">
			Larvae found
		</Badge>
	) : (
		<Badge tone="success" variant="outline">
			No larvae found
		</Badge>
	);
}

function InspectionLocationCard({
	geometry,
	geomType,
}: {
	readonly geometry: GeoJsonGeometry | null;
	readonly geomType: string | null;
}) {
	return (
		<RecordLocationCard
			emptyDescription="This inspection has no location to display."
			geojson={geometry}
			geomType={geomType}
		/>
	);
}

/**
 * What the inspection found, in one line.
 *
 * This was a card beside the location map: four stat tiles over a life-stage
 * section, stretched to a map's height. Two of those tiles said what the badges
 * a few pixels above it already said — the density and whether larvae were
 * present — so the card spent a column and 280 pixels carrying three facts, and
 * the two it repeated were the two an operator had just read.
 *
 * What is left is what nothing else on the page says: which stages were there,
 * how many larvae, and out of how much dipping. The rate closes the loop back to
 * the badge in the header — an agency configures its density bands as ranges of
 * larvae per dip, so printing the rate is what makes "Heavy" checkable instead of
 * asserted.
 *
 * A dry inspection renders nothing. Its Dry badge is already in the header, and
 * the sentence that used to fill this card — that larvae need standing water —
 * explained the job back to the person doing it.
 */
function FindingsLine({ inspection }: { readonly inspection: InspectionDetailRow }) {
	// A dry inspection is one badge and nothing else. There is no density to band,
	// no stages to strip, and no dipping to have done.
	if (!inspection.isWet) {
		return (
			<div className={findingsRow}>
				<WetnessBadge isWet={false} />
			</div>
		);
	}

	const rate = larvaePerDip(inspection.larvaeCount, inspection.dipCount);

	return (
		<div className={findingsRow}>
			{/*
			 * Verdict, then the evidence for it — and in that order because it is the
			 * order the explorer list already reads in, where a row is a density badge
			 * followed by its life-stage strip. Same two objects, same sequence, so the
			 * row an operator clicked and the record they land on read alike.
			 */}
			<DensityBadge density={inspection.density} />
			<PositivityBadge inspection={inspection} />
			<LifeStageStrip size="sm" stages={inspection} />
			<p className="m-0 flex flex-wrap items-baseline gap-x-2 text-sm">
				<span className="font-medium text-foreground tabular-nums">
					{effortLabel(inspection.larvaeCount, inspection.dipCount)}
				</span>
				{rate === null ? null : (
					<span className="text-muted-foreground tabular-nums">· {formatRate(rate)} per dip</span>
				)}
			</p>
		</div>
	);
}

const findingsRow = 'mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-2';

/**
 * `34 larvae in 12 dips`, degrading to whichever half was recorded.
 *
 * Zero is a finding, not a blank: twelve dips that turned up nothing is the
 * negative result surveillance is largely made of, and it has to read as
 * deliberate rather than as a field nobody filled in.
 */
function effortLabel(larvaeCount: number | null, dipCount: number | null): string {
	const larvae =
		larvaeCount === null
			? null
			: `${larvaeCount.toLocaleString()} ${plural(larvaeCount, 'larva', 'larvae')}`;
	const dips =
		dipCount === null ? null : `${dipCount.toLocaleString()} ${plural(dipCount, 'dip', 'dips')}`;

	if (larvae !== null && dips !== null) {
		return `${larvae} in ${dips}`;
	}
	return larvae ?? dips ?? 'Counts not recorded';
}

function plural(count: number, one: string, many: string): string {
	return count === 1 ? one : many;
}

/** One decimal at most: `2.8`, `3`, `0.5`. */
function formatRate(rate: number): string {
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(rate);
}

function ContextCard({ inspection }: { readonly inspection: InspectionDetailRow }) {
	const timeZone = useOrganizationTimeZone();
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Habitat">
						{inspection.habitatId === null ? (
							<span className="tabular-nums">{adhocLabel(inspection.lat, inspection.lng)}</span>
						) : (
							<Link
								className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
								params={{ id: inspection.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								<HabitatIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
								{siteLabel(inspection)}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Habitat type">
						<Suspense fallback={<span className="text-muted-foreground">Loading…</span>}>
							<HabitatTypeName habitatTypeId={inspection.habitatTypeId} />
						</Suspense>
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={inspection.addressId} />
					</DetailRow>
					<DetailRow label="Inspector">
						{inspection.inspectedByName ?? (
							<span className="text-muted-foreground">Unassigned</span>
						)}
					</DetailRow>
					<DetailRow label="Inspected">{formatFullDate(inspection.inspectionDate)}</DetailRow>
					<DetailRow label="Coordinates">{coordinateLabel(inspection)}</DetailRow>
					<DetailRow label="Recorded">{formatDateTime(inspection.createdAt, timeZone)}</DetailRow>
					<DetailRow label="Updated">{formatDateTime(inspection.updatedAt, timeZone)}</DetailRow>
				</dl>
				<AdditionalPersonnelList target={{ type: 'inspection', id: inspection.id }} />
			</CardContent>
		</Card>
	);
}

function InspectionSamplesCard({
	inspectionId,
	isWet,
}: {
	readonly inspectionId: string;
	readonly isWet: boolean;
}) {
	// Nested includes: samples for this inspection, each with its species
	// (correlated on sample_id). The correlated eq()s drive Electric on-demand
	// subset loading. Uses non-suspense useLiveQuery gated on status, NOT
	// useLiveSuspenseQuery, to avoid the post-unmount suspense hang on on-demand
	// collections (same rationale as the habitat history card).
	const result = useLiveQuery(
		{
			gcTime: samplesGcTimeMs,
			query: (query) =>
				query
					.from({ sample: webCollections.samples })
					.where(({ sample }) => eq(sample.inspectionId, inspectionId))
					.orderBy(({ sample }) => sample.createdAt, 'asc')
					.select(({ sample }) => ({
						id: sample.id,
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
		},
		[inspectionId],
	);

	const samples = (result.data ?? []) as unknown as readonly SampleEntry[];
	const isReady = result.isReady;

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<SampleIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Samples
						</CardTitle>
						<CardDescription>
							Specimens collected during this inspection and the species identified in each.
						</CardDescription>
					</div>
					{isReady && samples.length > 0 ? (
						<Badge tone="neutral" variant="outline">
							{samples.length}
						</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent padding="compact">
				{result.isError ? (
					<SamplesEmpty
						description="Sample records could not be loaded. Try again shortly."
						title="Samples Unavailable"
					/>
				) : !isReady ? (
					<div className="grid gap-2">
						{[0, 1].map((index) => (
							<Skeleton className="h-16 w-full" key={index} />
						))}
					</div>
				) : samples.length === 0 ? (
					<SamplesEmpty
						description={
							isWet
								? 'No specimens were collected during this inspection.'
								: 'Dry inspections collect no samples.'
						}
						title="No Samples Recorded"
					/>
				) : (
					<ul className="grid gap-2">
						{samples.map((sample) => (
							<SampleItem key={sample.id} sample={sample} />
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function SampleItem({ sample }: { readonly sample: SampleEntry }) {
	const result = sampleResult(sample);
	return (
		<li className="grid gap-2 rounded-md border border-border/40 bg-background/60 px-3 py-2.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Link
					className="rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
					params={{ id: sample.id }}
					to="/larval-surveillance/samples/$id"
				>
					{sampleName(sample)}
				</Link>
				<Badge tone={result.tone} variant="outline">
					{result.label}
				</Badge>
			</div>
			{sample.species.length === 0 ? (
				<span className="text-muted-foreground text-xs">No species identified</span>
			) : (
				<Suspense
					fallback={<span className="text-muted-foreground text-xs">Loading species…</span>}
				>
					<div className="flex flex-wrap gap-1.5">
						{sample.species.map((entry) => (
							<SpeciesChip entry={entry} key={entry.id} />
						))}
					</div>
				</Suspense>
			)}
			{sample.unidentifiableReason !== null && sample.unidentifiableReason.trim().length > 0 ? (
				<p className="m-0 text-muted-foreground text-xs">{sample.unidentifiableReason}</p>
			) : null}
		</li>
	);
}

function SpeciesChip({ entry }: { readonly entry: SampleSpeciesEntry }) {
	const name = useSpeciesName(entry.speciesId);
	return (
		<Badge tone="neutral" variant="outline">
			<SpeciesIcon aria-hidden="true" className="size-3 text-muted-foreground" />
			{name}
			<span className="tabular-nums">{entry.larvaeCount}</span>
		</Badge>
	);
}

// --- linked control actions -------------------------------------------------

type ActionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface LinkedActionBase {
	readonly id: string;
	readonly date: string;
	readonly actorProfileId: string | null;
}

// A normalized view over the five control-operations tables that carry an
// `inspection_id`, so an inspection can surface every intervention that cites it —
// what was done (or requested) as a follow-up to what the inspection found.
type LinkedAction =
	| (LinkedActionBase & {
			readonly kind: 'application';
			readonly insecticideId: string;
			readonly amount: number;
			readonly unitId: string;
	  })
	| (LinkedActionBase & {
			readonly kind: 'sourceReduction';
			readonly methodId: string;
			readonly amount: number;
			readonly unitId: string;
	  })
	| (LinkedActionBase & {
			readonly kind: 'outreachAction';
			readonly methodId: string;
			readonly reach: number;
	  })
	| (LinkedActionBase & {
			readonly kind: 'biocontrolAction';
			readonly methodId: string;
			readonly amount: number;
			readonly unitId: string;
	  })
	| (LinkedActionBase & {
			readonly kind: 'requestedControlAction';
			readonly controlType: ControlType;
			readonly summary: string | null;
			readonly resolvedAt: string | null;
	  });

const actionKindMeta: Record<
	LinkedAction['kind'],
	{ readonly label: string; readonly tone: ActionTone }
> = {
	application: { label: 'Application', tone: 'info' },
	sourceReduction: { label: 'Source reduction', tone: 'success' },
	outreachAction: { label: 'Outreach', tone: 'neutral' },
	biocontrolAction: { label: 'Biocontrol', tone: 'info' },
	requestedControlAction: { label: 'Control request', tone: 'warning' },
};

function LinkedControlActionsCard({ inspectionId }: { readonly inspectionId: string }) {
	const { actions, isReady, isError } = useLinkedControlActions(inspectionId);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<ControlIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Control actions
						</CardTitle>
						<CardDescription>
							Interventions carried out or requested as a result of this inspection.
						</CardDescription>
					</div>
					{isReady && actions.length > 0 ? (
						<Badge tone="neutral" variant="outline">
							{actions.length}
						</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent padding="compact">
				{isError ? (
					<LinkedActionsEmpty
						description="Linked control actions could not be loaded. Try again shortly."
						title="Control Actions Unavailable"
					/>
				) : !isReady ? (
					<div className="grid gap-2">
						{[0, 1].map((index) => (
							<Skeleton className="h-16 w-full" key={index} />
						))}
					</div>
				) : actions.length === 0 ? (
					<LinkedActionsEmpty
						description="No applications, source reductions, or other control actions reference this inspection yet."
						title="No Control Actions"
					/>
				) : (
					<ul className="grid gap-2">
						{actions.map((action) => (
							<LinkedActionRow action={action} key={`${action.kind}-${action.id}`} />
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function LinkedActionRow({ action }: { readonly action: LinkedAction }) {
	const meta = actionKindMeta[action.kind];
	return (
		<li className="grid gap-1.5 rounded-md border border-border/40 bg-background/60 px-3 py-2.5">
			<div className="flex flex-wrap items-center gap-2">
				<Badge tone={meta.tone} variant="outline">
					{meta.label}
				</Badge>
				<span className="text-muted-foreground text-xs tabular-nums">
					{formatMonthDayYear(action.date)}
				</span>
			</div>
			<p className="m-0 text-foreground text-sm">
				<LinkedActionSummary action={action} />
			</p>
			<p className="m-0 text-muted-foreground text-xs">
				<Suspense fallback={<span>…</span>}>
					<LinkedActionActor action={action} />
				</Suspense>
			</p>
		</li>
	);
}

function LinkedActionSummary({ action }: { readonly action: LinkedAction }) {
	switch (action.kind) {
		case 'application':
			return (
				<Suspense fallback={<span className="text-muted-foreground">Loading…</span>}>
					Treated with <InsecticideName id={action.insecticideId} /> ·{' '}
					<UnitAmount amount={action.amount} unitId={action.unitId} />
				</Suspense>
			);
		case 'sourceReduction':
			return (
				<Suspense fallback={<span className="text-muted-foreground">Loading…</span>}>
					<ControlMethodName
						collection={webCollections.sourceReductionMethods}
						id={action.methodId}
					/>{' '}
					· <UnitAmount amount={action.amount} unitId={action.unitId} /> eliminated
				</Suspense>
			);
		case 'outreachAction':
			return (
				<Suspense fallback={<span className="text-muted-foreground">Loading…</span>}>
					<ControlMethodName collection={webCollections.outreachMethods} id={action.methodId} /> ·{' '}
					{action.reach.toLocaleString()} reached
				</Suspense>
			);
		case 'biocontrolAction':
			return (
				<Suspense fallback={<span className="text-muted-foreground">Loading…</span>}>
					<ControlMethodName collection={webCollections.biocontrolMethods} id={action.methodId} /> ·{' '}
					<UnitAmount amount={action.amount} unitId={action.unitId} /> released
				</Suspense>
			);
		default:
			return (
				<>
					{controlTypeLabel(action.controlType)} requested
					{action.summary === null || action.summary.trim().length === 0
						? ''
						: ` — ${action.summary}`}
					{' · '}
					<span
						className={
							action.resolvedAt === null ? 'font-medium text-foreground' : 'text-muted-foreground'
						}
					>
						{action.resolvedAt === null ? 'Open' : 'Resolved'}
					</span>
				</>
			);
	}
}

function LinkedActionActor({ action }: { readonly action: LinkedAction }) {
	const label =
		action.kind === 'requestedControlAction'
			? 'Requested by'
			: action.kind === 'application'
				? 'Applicator'
				: 'Technician';
	if (action.actorProfileId === null) {
		return (
			<>
				{label}: <span className="text-muted-foreground">Unassigned</span>
			</>
		);
	}
	return (
		<>
			{label}: <ProfileName profileId={action.actorProfileId} />
		</>
	);
}

function useLinkedControlActions(inspectionId: string): {
	readonly actions: readonly LinkedAction[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const applications = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ application: webCollections.applications })
					.where(({ application }) => eq(application.inspectionId, inspectionId))
					.select(({ application }) => ({
						id: application.id,
						date: application.applicationDate,
						actorProfileId: application.applicatorProfileId,
						insecticideId: application.insecticideId,
						amount: application.amountApplied,
						unitId: application.applicationUnitId,
					})),
		},
		[inspectionId],
	);
	const sourceReductions = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ sourceReduction: webCollections.sourceReductions })
					.where(({ sourceReduction }) => eq(sourceReduction.inspectionId, inspectionId))
					.select(({ sourceReduction }) => ({
						id: sourceReduction.id,
						date: sourceReduction.sourceReductionDate,
						actorProfileId: sourceReduction.technicianProfileId,
						methodId: sourceReduction.sourceReductionMethodId,
						amount: sourceReduction.sourcesEliminatedAmount,
						unitId: sourceReduction.sourcesEliminatedUnitId,
					})),
		},
		[inspectionId],
	);
	const outreach = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ outreachAction: webCollections.outreachActions })
					.where(({ outreachAction }) => eq(outreachAction.inspectionId, inspectionId))
					.select(({ outreachAction }) => ({
						id: outreachAction.id,
						date: outreachAction.outreachDate,
						actorProfileId: outreachAction.technicianProfileId,
						methodId: outreachAction.outreachMethodId,
						reach: outreachAction.reach,
					})),
		},
		[inspectionId],
	);
	const biocontrol = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ biocontrolAction: webCollections.biocontrolActions })
					.where(({ biocontrolAction }) => eq(biocontrolAction.inspectionId, inspectionId))
					.select(({ biocontrolAction }) => ({
						id: biocontrolAction.id,
						date: biocontrolAction.biocontrolDate,
						actorProfileId: biocontrolAction.technicianProfileId,
						methodId: biocontrolAction.biocontrolMethodId,
						amount: biocontrolAction.amountReleased,
						unitId: biocontrolAction.releaseUnitId,
					})),
		},
		[inspectionId],
	);
	const requested = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ requestedControlAction: webCollections.requestedControlActions })
					.where(({ requestedControlAction }) =>
						eq(requestedControlAction.inspectionId, inspectionId),
					)
					.select(({ requestedControlAction }) => ({
						id: requestedControlAction.id,
						date: requestedControlAction.requestedAt,
						actorProfileId: requestedControlAction.requestedByProfileId,
						controlType: requestedControlAction.controlType,
						summary: requestedControlAction.summary,
						resolvedAt: requestedControlAction.resolvedAt,
					})),
		},
		[inspectionId],
	);

	const results = [applications, sourceReductions, outreach, biocontrol, requested];
	const isReady = results.every((result) => result.isReady);
	const isError = results.some((result) => result.isError);

	const actions = useMemo<readonly LinkedAction[]>(() => {
		const list: LinkedAction[] = [];
		for (const row of applications.data ?? []) {
			list.push({ kind: 'application', ...row } as LinkedAction);
		}
		for (const row of sourceReductions.data ?? []) {
			list.push({ kind: 'sourceReduction', ...row } as LinkedAction);
		}
		for (const row of outreach.data ?? []) {
			list.push({ kind: 'outreachAction', ...row } as LinkedAction);
		}
		for (const row of biocontrol.data ?? []) {
			list.push({ kind: 'biocontrolAction', ...row } as LinkedAction);
		}
		for (const row of requested.data ?? []) {
			list.push({ kind: 'requestedControlAction', ...row } as LinkedAction);
		}
		// Newest first; date strings (YYYY-MM-DD or ISO) sort lexicographically.
		list.sort((first, second) => second.date.localeCompare(first.date));
		return list;
	}, [applications.data, sourceReductions.data, outreach.data, biocontrol.data, requested.data]);

	return { actions, isReady, isError };
}

// insecticides, control methods, units, and profiles are eager baseline
// collections, so suspense is safe — unlike the on-demand action rows they label.
function InsecticideName({ id }: { readonly id: string }) {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ insecticide: webCollections.insecticides })
				.where(({ insecticide }) => eq(insecticide.id, id))
				.findOne(),
		[id],
	);
	return <>{result.data?.tradeName ?? 'Unknown insecticide'}</>;
}

function ControlMethodName({
	collection,
	id,
}: {
	readonly collection: (typeof webCollections)['sourceReductionMethods'];
	readonly id: string;
}) {
	const result = useLiveSuspenseQuery((query) => query.from({ method: collection }), [collection]);
	const match = result.data.find((method) => method.id === id);
	return <>{match?.name ?? 'Unknown method'}</>;
}

function UnitAmount({ amount, unitId }: { readonly amount: number; readonly unitId: string }) {
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
		<span className="tabular-nums">
			{formatAmount(amount)}
			{abbreviation === '' ? null : ` ${abbreviation}`}
		</span>
	);
}

/** See the twin in `-habitat-detail.tsx`: one roster read, not one per name. */
function ProfileName({ profileId }: { readonly profileId: string }) {
	return <>{useProfileNames().get(profileId) ?? 'Unknown'}</>;
}

function LinkedActionsEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[140px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<ControlIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
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

function HabitatTypeName({ habitatTypeId }: { readonly habitatTypeId: string | null }) {
	const result = useLiveSuspenseQuery(
		(query) => query.from({ habitatType: webCollections.habitatTypes }),
		[],
	);
	if (habitatTypeId === null) {
		return <span className="text-muted-foreground">Unassigned type</span>;
	}
	const match = result.data.find((habitatType) => habitatType.id === habitatTypeId);
	return <>{match?.name ?? 'Unknown type'}</>;
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

// --- data hook --------------------------------------------------------------

function useInspectionDetail(id: string) {
	return useQuery({
		queryKey: ['inspection-detail', id],
		queryFn: ({ signal }) => fetchInspectionDetail(id, signal),
		placeholderData: (previous) => previous,
	});
}

async function fetchInspectionDetail(
	id: string,
	signal: AbortSignal,
): Promise<InspectionDetailRow | null> {
	const response = await fetch(new URL(`/map/inspections/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Inspection request failed (${response.status}).`);
	}
	const body = (await response.json()) as { readonly inspection?: InspectionDetailRow };
	return body.inspection ?? null;
}

// --- presentational states --------------------------------------------------

function SamplesEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[140px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SampleIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function InspectionDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-48" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<div className="grid gap-5 lg:grid-cols-2">
						<Skeleton className="h-[420px]" />
						<Skeleton className="h-[420px]" />
					</div>
					<Skeleton className="h-48" />
				</div>
				<Skeleton className="h-96" />
			</div>
		</>
	);
}

// --- helpers ----------------------------------------------------------------

const sampleResultTones = {
	zero: { label: 'Zero larvae', tone: 'neutral' },
	unidentifiable: { label: 'Unidentifiable', tone: 'warning' },
	nonMosquito: { label: 'Non-mosquito', tone: 'info' },
	larvae: { label: 'Larvae present', tone: 'danger' },
} as const satisfies Record<
	string,
	{ readonly label: string; readonly tone: 'neutral' | 'info' | 'warning' | 'danger' }
>;

function sampleResult(
	sample: SampleEntry,
): (typeof sampleResultTones)[keyof typeof sampleResultTones] {
	if (sample.isZeroLarvae) {
		return sampleResultTones.zero;
	}
	if (sample.unidentifiableReason !== null && sample.unidentifiableReason.trim().length > 0) {
		return sampleResultTones.unidentifiable;
	}
	if (sample.hasNonMosquito) {
		return sampleResultTones.nonMosquito;
	}
	return sampleResultTones.larvae;
}

function sampleName(sample: SampleEntry): string {
	return sample.displayName?.trim() || `Sample ${sample.id.slice(0, 8)}`;
}

function siteLabel(inspection: InspectionDetailRow): string {
	return (
		inspection.habitatName?.trim() ||
		inspection.addressDisplayName?.trim() ||
		(inspection.habitatId === null
			? adhocLabel(inspection.lat, inspection.lng)
			: `Habitat ${inspection.habitatId.slice(0, 8)}`)
	);
}

function breadcrumbLabel(inspection: InspectionDetailRow): string {
	return `Inspection · ${formatMonthDayYear(inspection.inspectionDate)}`;
}

// Trim trailing zeros from stored decimals (2.50 -> 2.5) while keeping whole
// amounts whole, so applied/eliminated quantities read naturally next to a unit.
function formatAmount(value: number): string {
	if (!Number.isFinite(value)) {
		return '—';
	}
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

function controlTypeLabel(controlType: ControlType): string {
	switch (controlType) {
		case 'application':
			return 'Application';
		case 'source_reduction':
			return 'Source reduction';
		case 'biocontrol':
			return 'Biocontrol';
		default:
			return 'Outreach';
	}
}

function coordinateLabel(inspection: InspectionDetailRow): string {
	if (inspection.lat == null || inspection.lng == null) {
		return 'Unknown coordinates';
	}
	return `${inspection.lat.toFixed(5)}, ${inspection.lng.toFixed(5)}`;
}

/** Long-form date from a `YYYY-MM-DD` inspection date (parsed as its own UTC day). */
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
