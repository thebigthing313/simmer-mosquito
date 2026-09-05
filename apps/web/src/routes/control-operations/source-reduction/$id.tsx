import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { AskAcknowledged } from '../../../components/acknowledged-write';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	RecordDetailColumns,
	RecordDetailHeader,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
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
import { CONTROL_ACTION_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { formatActionDate, formatMeasure } from '../-control-display';

export const Route = createFileRoute('/control-operations/source-reduction/$id')({
	component: RouteComponent,
});

const SourceReductionIcon = iconRegistry.entities.sourceReductionAction.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const sourceReductionGcTimeMs = 30_000;

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { eyebrow: 'w-20', main: ['h-[360px]'], aside: ['h-72'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// One query for the action, its method, unit, technician and address — the four
	// lookups this page used to do for itself. `sourceReductions` is on-demand, so
	// this is status-gated rather than suspending; see the hook.
	const {
		action: sourceReduction,
		isReady,
		isError,
	} = useSourceReduction(id, { gcTime: sourceReductionGcTimeMs });

	return (
		<RecordDetailPage
			back={{ label: 'Back to source reduction', to: '/control-operations/source-reduction' }}
			deleteRefusals={CONTROL_ACTION_DELETE_REFUSALS}
			layout={layout}
			noun="source reduction action"
			reading={{ isError, isReady, record: sourceReduction }}
			unavailableTitle="Source Reduction Unavailable"
		>
			{(record, askDelete) => (
				<SourceReductionDetailContent askDelete={askDelete} sourceReduction={record} />
			)}
		</RecordDetailPage>
	);
}

function SourceReductionDetailContent({
	askDelete,
	sourceReduction,
}: {
	readonly askDelete: AskAcknowledged;
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
		<RecordDetailColumns
			aside={
				<>
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
				</>
			}
			header={
				<RecordDetailHeader
					actions={
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
					}
					eyebrow="Source reduction"
					icon={SourceReductionIcon}
					subtitle={`${amountLabel} eliminated · ${formatActionDate(sourceReduction.actionDate)}`}
					title={methodName}
				/>
			}
			layout={layout}
		>
			<div className="grid content-start gap-3">
				<SourceReductionLocationCard habitatName={habitatName} sourceReduction={sourceReduction} />
				<RecordRegionsBand
					noun="source reduction action"
					recordId={sourceReduction.id}
					recordType="source_reductions"
				/>
			</div>
			<DangerZoneCard
				ask={askDelete}
				name={methodName}
				noun="source reduction"
				onDelete={(acknowledgements) => remove(sourceReduction.id, acknowledgements)}
				recordId={sourceReduction.id}
				recordType="sourceReduction"
				returnTo="/control-operations/source-reduction"
			/>
		</RecordDetailColumns>
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
				<DetailList>
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Eliminated">{amountLabel}</DetailRow>
					<DetailRow label="Date">{formatActionDate(sourceReduction.actionDate)}</DetailRow>
					<DetailRow empty="Unassigned" label="Technician">
						{technicianName}
					</DetailRow>
					<DetailRow label="Habitat">
						{habitatId === null ? null : (
							<Link
								className={recordLink({ tone: 'value' })}
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
				</DetailList>
				<AdditionalPersonnelList target={{ type: 'sourceReduction', id: sourceReduction.id }} />
			</CardContent>
		</Card>
	);
}
