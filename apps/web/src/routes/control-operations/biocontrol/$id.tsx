import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import type { AskAcknowledged } from '../../../components/acknowledged-write';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { EmptyValue } from '../../../components/empty-value';
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
import { useBiocontrolActionMutations } from '../../../hooks/mutations/use-biocontrol-action-mutations';
import type { BiocontrolAction } from '../../../hooks/queries/control-action-view';
import { useBiocontrolAction } from '../../../hooks/queries/use-biocontrol-action';
import { useBiocontrolMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useHabitatLocationContext } from '../../../hooks/use-habitat-geometry';
import { BIOCONTROL_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { CONTROL_ACTION_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { ContextBadge, formatActionDate, formatMeasure } from '../-control-display';

const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const biocontrolGcTimeMs = 30_000;

export const Route = createFileRoute('/control-operations/biocontrol/$id')({
	component: RouteComponent,
});

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { eyebrow: 'w-20', main: ['h-[360px]'], aside: ['h-72'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// One query for the release, its method, unit, technician and address — the
	// lookups this page used to do for itself. `biocontrol_actions` is on-demand,
	// so this is status-gated rather than suspending; see the hook.
	const { action, isReady, isError } = useBiocontrolAction(id, { gcTime: biocontrolGcTimeMs });

	return (
		<RecordDetailPage
			back={{ label: 'Back to biocontrol', to: '/control-operations/biocontrol' }}
			deleteRefusals={CONTROL_ACTION_DELETE_REFUSALS}
			layout={layout}
			noun="biocontrol action"
			reading={{ isError, isReady, record: action }}
		>
			{(record, askDelete) => <BiocontrolDetailContent action={record} askDelete={askDelete} />}
		</RecordDetailPage>
	);
}

function BiocontrolDetailContent({
	action,
	askDelete,
}: {
	readonly action: BiocontrolAction;
	readonly askDelete: AskAcknowledged;
}) {
	// The roster is still read, but only for the custom-field schema the chosen
	// method declares — the method's *name* arrives joined.
	const methods = useBiocontrolMethodRoster();
	const { remove } = useBiocontrolActionMutations();
	// habitats is on-demand; resolve just the linked habitat's name as a subset.
	const habitatIds = useMemo(
		() => (action.habitatId === null ? [] : [action.habitatId]),
		[action.habitatId],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const methodName = action.methodName;
	const amountLabel = formatMeasure(action.amountReleased, action.unitAbbreviation);
	const technicianName = action.technicianName;
	const habitatName =
		action.habitatId === null ? null : (habitatNameById.get(action.habitatId) ?? 'Unknown habitat');

	useBreadcrumbLabel(action.id, `${methodName} · ${formatActionDate(action.actionDate)}`);

	return (
		<RecordDetailColumns
			aside={
				<>
					<BiocontrolDetailsCard
						action={action}
						amountLabel={amountLabel}
						habitatName={habitatName}
						methodName={methodName}
						technicianName={technicianName}
					/>
					<CustomFieldsCard
						metadata={action.metadata}
						schema={customSchemaFor(methods, action.methodId)}
					/>
					<CommentsSection
						description="Follow-up, agent survival, and restocking notes for this release."
						target={{ type: 'biocontrolAction', id: action.id }}
					/>
				</>
			}
			header={
				<RecordDetailHeader
					actions={
						<>
							<ContextBadge habitatId={action.habitatId} inspectionId={action.inspectionId} />
							<WriteOnly>
								<Button asChild size="sm" variant="outline">
									<Link params={{ id: action.id }} to="/control-operations/biocontrol/$id/edit">
										<EditIcon aria-hidden="true" />
										Edit
									</Link>
								</Button>
							</WriteOnly>
						</>
					}
					eyebrow="Biocontrol"
					icon={BiocontrolIcon}
					subtitle={`${amountLabel} released on ${formatActionDate(action.actionDate)}`}
					title={methodName}
				/>
			}
			layout={layout}
		>
			<div className="grid content-start gap-3">
				<ReleaseLocationCard action={action} habitatName={habitatName} />
				<RecordRegionsBand
					noun="biocontrol action"
					recordId={action.id}
					recordType="biocontrol_actions"
				/>
			</div>
			<DangerZoneCard
				ask={askDelete}
				name={methodName}
				noun="biocontrol action"
				onDelete={(acknowledgements) => remove(action.id, acknowledgements)}
				recordId={action.id}
				recordType="biocontrolAction"
				returnTo="/control-operations/biocontrol"
			/>
		</RecordDetailColumns>
	);
}

/**
 * A biocontrol release owns Point/LineString/Polygon geometry, so the detail page
 * renders the release area as drawn rather than collapsing it to a centroid.
 * Electric streams only the centroid (ADR 0009), so it is fetched here.
 *
 * The habitat stocked draws underneath it, so the release area reads against the
 * water body it was meant to cover.
 */
function ReleaseLocationCard({
	action,
	habitatName,
}: {
	readonly action: BiocontrolAction;
	readonly habitatName: string | null;
}) {
	const geometry = useOwnedGeometry(
		BIOCONTROL_GEOMETRY_SOURCE,
		action.id,
		action.updatedAt.toISOString(),
	);
	const habitatContext = useHabitatLocationContext(action.habitatId, habitatName);

	return (
		<RecordLocationCard
			context={habitatContext}
			emptyDescription="This biocontrol action has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? action.geometryKind}
			isError={geometry.isError}
			isPending={geometry.isPending}
		/>
	);
}

function BiocontrolDetailsCard({
	action,
	amountLabel,
	methodName,
	technicianName,
	habitatName,
}: {
	readonly action: BiocontrolAction;
	readonly amountLabel: string;
	readonly methodName: string;
	readonly technicianName: string | null;
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
					<DetailRow label="Released">{amountLabel}</DetailRow>
					<DetailRow label="Date">{formatActionDate(action.actionDate)}</DetailRow>
					<DetailRow label="Technician">
						{technicianName ?? <span className="text-muted-foreground">Unassigned</span>}
					</DetailRow>
					<DetailRow label="Habitat">
						{action.habitatId === null || habitatName === null ? (
							<EmptyValue />
						) : (
							<Link
								className="rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: action.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								{habitatName}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={action.addressId} />
					</DetailRow>
				</dl>
				<AdditionalPersonnelList target={{ type: 'biocontrolAction', id: action.id }} />
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
