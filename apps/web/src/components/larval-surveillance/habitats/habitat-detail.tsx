import { formatGeometryTypeLabel } from '@simmer-mosquito/mapping';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { customFieldEntries } from '@simmer-mosquito/ui-web/components/form';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useHabitatTypeName } from '../../../hooks/larval-surveillance/use-habitat-type-name';
import { useHabitatTypeSchema } from '../../../hooks/larval-surveillance/use-habitat-type-schema';
import { useHabitatMutations } from '../../../hooks/mutations/use-habitat-mutations';
import type { Habitat } from '../../../hooks/queries/habitat-view';
import { useHabitatSuspense } from '../../../hooks/queries/use-habitat-suspense';
import { useRecordRoutes } from '../../../hooks/queries/use-record-routes';
import type { AskAcknowledged } from '../../../hooks/use-acknowledged-write';
import { useHabitatGeometry } from '../../../hooks/use-habitat-geometry';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { HABITAT_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { coordinateLabel } from '../../../lib/coordinate-label';
import { recordNoun } from '../../../lib/record-nouns';
import { WRITE_SURFACE_FLOORS } from '../../../lib/write-surfaces';
import { useBreadcrumbLabel } from '../../app-shell';
import { CommentsSection } from '../../comments-section';
import { CustomFieldsList } from '../../custom-fields-card';
import { LinkedAddressValueById } from '../../linked-address';
import { RecordLocationCard } from '../../map/record-location-card';
import { RecordRegionsBand } from '../../map/record-regions-band';
import {
	createItems,
	DetailPageShell,
	detailBodyClass,
	type RecordDetailLayout,
	RecordDetailPage,
	RecordDetailSkeleton,
	RecordUnavailable,
} from '../../record';
import type { HabitatGeometry } from './habitat-geometry-cache';
import { HabitatHistoryCard, HistorySkeleton } from './habitat-history-card';
import { formatDateTime, ProfileName } from './habitat-history-values';
import { HabitatInspectionStats } from './habitat-inspection-stats';

interface HabitatDetailProps {
	readonly habitatId: string;
}

const HabitatIcon = iconRegistry.entities.habitat.icon;
const MergeIcon = iconRegistry.actions.merge.icon;

/**
 * The habitat's readiness is a Suspense boundary rather than a flag, so this
 * page hands the frame a body. The loader below reports the unavailable state,
 * because nothing outside a suspended tree can find out there is no record.
 */
const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: {
		main: [['h-[460px]', 'h-[460px]'], 'h-64'],
		aside: ['h-96'],
	},
};

export function HabitatDetail({ habitatId }: HabitatDetailProps) {
	return (
		<RecordDetailPage
			body={(askDelete) => (
				<Suspense fallback={<RecordDetailSkeleton layout={layout} />}>
					<HabitatDetailLoader askDelete={askDelete} habitatId={habitatId} />
				</Suspense>
			)}
			deleteRefusals={HABITAT_DELETE_REFUSALS}
			layout={layout}
			recordType="habitat"
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
		return (
			<div className={detailBodyClass()}>
				<RecordUnavailable reason="not-found" recordType="habitat" />
			</div>
		);
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

	// Geometry is not part of the Electric shape (ADR 0009), so it is fetched
	// from the server display endpoint.
	const { data: geometry, isPending: isGeometryPending } = useHabitatGeometry(habitat.id);
	const resolvedGeometry = geometry ?? null;
	const mutations = useHabitatMutations();

	return (
		<DetailPageShell
			aside={
				<>
					<HabitatInspectionStats habitatId={habitat.id} />
					<CommentsSection
						description="Field notes, access details, and status updates for this habitat."
						target={{ type: 'habitat', id: habitat.id }}
					/>
				</>
			}
			facts={<HabitatDetailsCard habitat={habitat} />}
			header={{
				actions: [
					...createItems('habitatId', habitat.id, [
						'/larval-surveillance/inspections/create',
						'/control-operations/chemical/create',
						'/control-operations/source-reduction/create',
						'/control-operations/biocontrol/create',
					]),
					{
						/*
						 * Merging is reached from a habitat rather than from a list of proposals; the
						 * habitat somebody is already looking at is the one that survives.
						 */
						icon: MergeIcon,
						id: 'merge',
						label: 'Merge duplicates',
						minimum: WRITE_SURFACE_FLOORS['/larval-surveillance/habitats/$id/merge'],
						params: { id: habitat.id },
						separatorBefore: true,
						to: '/larval-surveillance/habitats/$id/merge',
					},
				],
				edit: { params: { id: habitat.id }, to: '/larval-surveillance/habitats/$id/edit' },
				flags: <HabitatStateBadges habitat={habitat} />,
				icon: HabitatIcon,
				recordType: 'habitat',
				remove: {
					ask: askDelete,
					name: habitat.name,
					onDelete: (acknowledgements) => mutations.remove(habitat.id, acknowledgements),
					recordId: habitat.id,
					returnTo: '/larval-surveillance/habitats',
				},
				subtitle: (
					<Suspense fallback={<span>Loading type…</span>}>
						<HabitatTypeSubtitle habitatTypeId={habitat.typeId} />
					</Suspense>
				),
				tags: { recordId: habitat.id, recordType: 'habitat' },
				title: habitat.name,
			}}
			layout={layout}
			lead={<HabitatLocationCard geometry={resolvedGeometry} isPending={isGeometryPending} />}
		>
			{/* The band goes under the lead row rather than inside its left half:
			    the spec puts it at the full width of the main column, and at 328px
			    a folder row wraps where six chips are meant to fit on one line. */}
			<RecordRegionsBand recordId={habitat.id} recordType="habitats" />
			<Suspense fallback={<HistorySkeleton />}>
				<HabitatHistoryCard habitatId={habitat.id} />
			</Suspense>
		</DetailPageShell>
	);
}

/**
 * The habitat's type in a fact row, or `null` when it has none so the
 * `DetailRow` draws the absent mark. The subtitle needs words instead; see
 * {@link HabitatTypeSubtitle}.
 */
function HabitatTypeLabel({ habitatTypeId }: { readonly habitatTypeId: string | null }) {
	const typeName = useHabitatTypeName(habitatTypeId);
	return typeName === null ? null : <span>{typeName}</span>;
}

/** The same name, in the header, where an unassigned type is said in words. */
function HabitatTypeSubtitle({ habitatTypeId }: { readonly habitatTypeId: string | null }) {
	return <span>{useHabitatTypeName(habitatTypeId) ?? 'Unassigned type'}</span>;
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
	return (
		<RecordLocationCard
			description={locationSummary(geometry, isPending)}
			emptyDescription="This habitat has no location to display."
			geojson={geometry?.geojson ?? null}
			geomType={geometry?.geomType ?? null}
			height="h-[380px]"
			isPending={isPending}
			unsupportedShape={geometry?.unsupportedShape ?? null}
		/>
	);
}

function HabitatDetailsCard({ habitat }: { readonly habitat: Habitat }) {
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent padding="compact" className="grid gap-4">
				<div className="grid gap-1">
					<span className="text-xs font-semibold text-muted-foreground uppercase">Description</span>
					<p className="m-0 text-sm text-foreground">{habitatDescription(habitat)}</p>
				</div>
				<DetailList>
					<DetailRow label="Habitat type">
						<Suspense fallback={<span className="text-muted-foreground">Loading…</span>}>
							<HabitatTypeLabel habitatTypeId={habitat.typeId} />
						</Suspense>
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={habitat.addressId} />
					</DetailRow>
					<DetailRow label={recordNoun('route').titleMany}>
						<Suspense fallback={<span className="text-muted-foreground">Loading routes…</span>}>
							<HabitatRoutes habitatId={habitat.id} />
						</Suspense>
					</DetailRow>
					<DetailRow label="Created">
						<AuditValue at={habitat.createdAt} profileId={habitat.createdByProfileId} />
					</DetailRow>
					<DetailRow label="Updated">
						<AuditValue at={habitat.updatedAt} profileId={habitat.updatedByProfileId} />
					</DetailRow>
				</DetailList>
				<Suspense fallback={null}>
					<HabitatMetadata habitatTypeId={habitat.typeId} metadata={habitat.metadata} />
				</Suspense>
			</CardContent>
		</Card>
	);
}

/**
 * The habitat's metadata, read through its type's custom schema. Values the
 * schema no longer declares still render. The habitat form is the only one that
 * sets `allowExtra`, so an undeclared key here is a note somebody typed rather
 * than a retired field, which is what `allowsExtraKeys` tells the list.
 */
function HabitatMetadata({
	habitatTypeId,
	metadata,
}: {
	readonly habitatTypeId: string | null;
	readonly metadata: unknown;
}) {
	const schema = useHabitatTypeSchema(habitatTypeId);
	const entries = customFieldEntries(schema, metadata);
	if (entries.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1.5">
			<span className="text-xs font-semibold text-muted-foreground uppercase">Metadata</span>
			{/* The same list every other record's custom fields render through, so an
			    organization-authored label wraps here too rather than being clipped
			    by the curated-label column `DetailRow` above is sized for. */}
			<CustomFieldsList allowsExtraKeys entries={entries} />
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

/**
 * The routes this habitat is a stop on. `route_items` is on-demand, so this
 * reads through a non-suspense `useLiveQuery` gated on status rather than
 * `useLiveSuspenseQuery`, which hangs after unmount over an on-demand
 * collection.
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
						className={cn(recordLink({ tone: 'value' }), 'w-fit')}
						params={{ id: routeId }}
						to="/larval-surveillance/habitats/routes/$id"
					>
						{routeName}
					</Link>
					{/* Where in the run it falls, the thing a crew lead is actually
					    asking when they ask which route a site is on. */}
					<span className="text-muted-foreground text-xs tabular-nums">stop {position}</span>
				</li>
			))}
		</ul>
	);
}

function habitatDescription(habitat: Habitat): string {
	return habitat.description.trim() || 'No description recorded.';
}

function locationSummary(geometry: HabitatGeometry | null, isPending: boolean): string {
	if (isPending) {
		return 'Loading geometry…';
	}
	if (geometry == null || geometry.geojson == null) {
		return 'No geometry recorded';
	}
	return `${formatGeometryTypeLabel(geometry.geomType ?? '')} · ${coordinateLabel(geometry.lat, geometry.lng)}`;
}
