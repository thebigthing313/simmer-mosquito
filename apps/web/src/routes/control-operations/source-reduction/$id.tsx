import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { EmptyValue } from '../../../components/empty-value';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useSourceReductionMutations } from '../../../hooks/mutations/use-source-reduction-mutations';
import type { SourceReduction } from '../../../hooks/queries/control-action-view';
import { useSourceReductionMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useSourceReduction } from '../../../hooks/queries/use-source-reduction';
import { useHabitatLocationContext } from '../../../hooks/use-habitat-geometry';
import {
	SOURCE_REDUCTION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../../hooks/use-owned-geometry';
import { formatActionDate, formatMeasure } from '../-control-display';

export const Route = createFileRoute('/control-operations/source-reduction/$id')({
	component: RouteComponent,
});

const SourceReductionIcon = iconRegistry.entities.sourceReductionAction.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const sourceReductionGcTimeMs = 30_000;

function RouteComponent() {
	const { id } = Route.useParams();
	return <SourceReductionDetail sourceReductionId={id} />;
}

function SourceReductionDetail({ sourceReductionId }: { readonly sourceReductionId: string }) {
	// One query for the action, its method, unit, technician and address — the four
	// lookups this page used to do for itself. `sourceReductions` is on-demand, so
	// this is status-gated rather than suspending; see the hook.
	const { action: sourceReduction, isReady } = useSourceReduction(sourceReductionId, {
		gcTime: sourceReductionGcTimeMs,
	});

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link className={backLink()} to="/control-operations/source-reduction">
					<ArrowLeftIcon aria-hidden="true" />
					Back to source reduction
				</Link>
				{!isReady ? (
					<SourceReductionDetailSkeleton />
				) : sourceReduction === undefined ? (
					<RecordUnavailable
						noun="source reduction action"
						reason="not-found"
						title="Source Reduction Unavailable"
					/>
				) : (
					<SourceReductionDetailContent sourceReduction={sourceReduction} />
				)}
			</div>
		</div>
	);
}

function SourceReductionDetailContent({
	sourceReduction,
}: {
	readonly sourceReduction: SourceReduction;
}) {
	// The method roster is still read, but only for the custom-field schema the
	// chosen method declares — the method's *name* arrives joined.
	const methods = useSourceReductionMethodRoster();
	const { remove } = useSourceReductionMutations();
	// habitats is on-demand; resolve just the linked habitat's name as a subset.
	const habitatIds = useMemo(
		() => (sourceReduction.habitatId === null ? [] : [sourceReduction.habitatId]),
		[sourceReduction.habitatId],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const methodName = sourceReduction.methodName;
	const amountLabel = formatMeasure(
		sourceReduction.sourcesEliminated,
		sourceReduction.unitAbbreviation,
	);
	const technicianName = sourceReduction.technicianName;
	const habitatId = sourceReduction.habitatId;
	const habitatName = habitatId === null ? null : (habitatNameById.get(habitatId) ?? null);

	useBreadcrumbLabel(sourceReduction.id, methodName);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<SourceReductionIcon aria-hidden="true" className="size-3.5" />
						Source reduction
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{methodName}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{amountLabel} eliminated · {formatActionDate(sourceReduction.actionDate)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<WriteOnly>
						<Button asChild size="sm" variant="outline">
							<Link
								params={{ id: sourceReduction.id }}
								to="/control-operations/source-reduction/$id/edit"
							>
								<EditIcon aria-hidden="true" />
								Edit
							</Link>
						</Button>
					</WriteOnly>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<SourceReductionLocationCard
						habitatName={habitatName}
						sourceReduction={sourceReduction}
					/>
					<DangerZoneCard
						name={methodName}
						noun="source reduction"
						onDelete={() => remove(sourceReduction.id)}
						recordId={sourceReduction.id}
						recordType="sourceReduction"
						returnTo="/control-operations/source-reduction"
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<SourceReductionDetailsCard
						amountLabel={amountLabel}
						habitatId={habitatId}
						habitatName={habitatName}
						methodName={methodName}
						sourceReduction={sourceReduction}
						technicianName={technicianName}
					/>
					<CustomFieldsCard
						metadata={sourceReduction.metadata}
						schema={customSchemaFor(methods, sourceReduction.methodId)}
					/>
					<CommentsSection
						description="Follow-up, access notes, and anything crews should know about this work."
						target={{ type: 'sourceReduction', id: sourceReduction.id }}
					/>
				</div>
			</div>
		</>
	);
}

/**
 * A source reduction owns Point/LineString/Polygon geometry, so the detail page
 * renders the shape that was actually recorded rather than its centroid — the
 * treated stretch or area is the point of the record. Electric streams only the
 * centroid (ADR 0009), so the full geometry is fetched here.
 *
 * The habitat the work was performed against draws underneath it: a treated
 * stretch is only legible inside the ditch it was cut from, and an action that
 * recorded no shape of its own is still located by its habitat.
 */
function SourceReductionLocationCard({
	sourceReduction,
	habitatName,
}: {
	readonly sourceReduction: SourceReduction;
	readonly habitatName: string | null;
}) {
	const geometry = useOwnedGeometry(
		SOURCE_REDUCTION_GEOMETRY_SOURCE,
		sourceReduction.id,
		sourceReduction.updatedAt.toISOString(),
	);
	const habitatContext = useHabitatLocationContext(sourceReduction.habitatId, habitatName);

	return (
		<RecordLocationCard
			context={habitatContext}
			emptyDescription="This source reduction action has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? sourceReduction.geometryKind}
			isError={geometry.isError}
			isPending={geometry.isPending}
		/>
	);
}

function SourceReductionDetailsCard({
	sourceReduction,
	methodName,
	amountLabel,
	technicianName,
	habitatId,
	habitatName,
}: {
	readonly sourceReduction: SourceReduction;
	readonly methodName: string;
	readonly amountLabel: string;
	readonly technicianName: string | null;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Eliminated">{amountLabel}</DetailRow>
					<DetailRow label="Date">{formatActionDate(sourceReduction.actionDate)}</DetailRow>
					<DetailRow label="Technician">
						{technicianName ?? <span className="text-muted-foreground">Unassigned</span>}
					</DetailRow>
					<DetailRow label="Habitat">
						{habitatId === null ? (
							<EmptyValue />
						) : (
							<Link
								className="rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								{habitatName ?? `Habitat ${habitatId.slice(0, 8)}`}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={sourceReduction.addressId} />
					</DetailRow>
				</dl>
				<AdditionalPersonnelList target={{ type: 'sourceReduction', id: sourceReduction.id }} />
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[90px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function SourceReductionDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-[360px]" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}
