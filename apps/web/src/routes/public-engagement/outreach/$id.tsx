import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { AskAcknowledged } from '../../../components/acknowledged-write';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	DetailPageShell,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { useOutreachActionMutations } from '../../../hooks/mutations/use-outreach-action-mutations';
import type { OutreachAction } from '../../../hooks/queries/outreach-view';
import { activityGcTimeMs } from '../../../hooks/queries/shared';
import { useOutreachMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useOutreachAction } from '../../../hooks/queries/use-outreach-action';
import { OUTREACH_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { CONTROL_ACTION_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { formatActionDate } from '../../control-operations/-control-display';
import { formatReach } from '../-public-engagement-display';

const OutreachIcon = iconRegistry.entities.outreachAction.icon;

export const Route = createFileRoute('/public-engagement/outreach/$id')({
	component: RouteComponent,
});

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { main: [['h-[360px]', 'h-64']], aside: ['h-72'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// One query for the action, its method, technician and address — the lookups
	// this page used to do for itself. `outreach_actions` is on-demand, so this is
	// status-gated rather than suspending; see the hook.
	const { action, isReady, isError } = useOutreachAction(id, { gcTime: activityGcTimeMs });

	return (
		<RecordDetailPage
			deleteRefusals={CONTROL_ACTION_DELETE_REFUSALS}
			layout={layout}
			recordType="outreachAction"
			reading={{ isError, isReady, record: action }}
		>
			{(record, askDelete) => <OutreachDetailContent action={record} askDelete={askDelete} />}
		</RecordDetailPage>
	);
}

function OutreachDetailContent({
	action,
	askDelete,
}: {
	readonly action: OutreachAction;
	readonly askDelete: AskAcknowledged;
}) {
	// The roster is still read, but only for the custom-field schema the chosen
	// method declares — the method's *name* arrives joined.
	const methods = useOutreachMethodRoster();
	const { remove } = useOutreachActionMutations();

	const methodName = action.methodName;
	const technicianName = action.technicianName;

	useBreadcrumbLabel(action.id, `${methodName} · ${formatActionDate(action.outreachDate)}`);

	return (
		<DetailPageShell
			aside={
				<CommentsSection
					description="Follow-up, materials, and response notes for this outreach."
					target={{ type: 'outreachAction', id: action.id }}
				/>
			}
			facts={
				<>
					<OutreachDetailsCard
						action={action}
						methodName={methodName}
						technicianName={technicianName}
					/>
					<CustomFieldsCard
						metadata={action.metadata}
						schema={customSchemaFor(methods, action.methodId)}
					/>
				</>
			}
			header={{
				edit: { params: { id: action.id }, to: '/public-engagement/outreach/$id/edit' },
				icon: OutreachIcon,
				recordType: 'outreachAction',
				remove: {
					ask: askDelete,
					name: methodName,
					onDelete: (acknowledgements) => remove(action.id, acknowledgements),
					recordId: action.id,
					returnTo: '/public-engagement/outreach',
				},
				subtitle: `${formatReach(action.reach)} reached on ${formatActionDate(action.outreachDate)}`,
				title: methodName,
			}}
			layout={layout}
			lead={
				<div className="grid content-start gap-3">
					<OutreachLocationCard action={action} />
					<RecordRegionsBand recordId={action.id} recordType="outreach_actions" />
				</div>
			}
		></DetailPageShell>
	);
}

/**
 * An outreach action owns Point/LineString/Polygon geometry, so the detail page
 * renders the area as drawn rather than collapsing it to a centroid. Electric
 * streams only the centroid (ADR 0009), so the full shape is fetched here.
 */
function OutreachLocationCard({ action }: { readonly action: OutreachAction }) {
	const geometry = useOwnedGeometry(
		OUTREACH_GEOMETRY_SOURCE,
		action.id,
		action.updatedAt.toISOString(),
	);

	return (
		<RecordLocationCard
			emptyDescription="This outreach action has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? action.geometryKind}
			isError={geometry.isError}
			isPending={geometry.isPending}
			unsupportedShape={geometry.unsupportedShape}
		/>
	);
}

function OutreachDetailsCard({
	action,
	methodName,
	technicianName,
}: {
	readonly action: OutreachAction;
	readonly methodName: string;
	readonly technicianName: string | null;
}) {
	// addresses sync on demand, so resolve just the linked one as a bounded subset.
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<DetailList>
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Reached">{formatReach(action.reach)}</DetailRow>
					<DetailRow label="Who">
						{action.reachDescription === null ? null : (
							// Written in a textarea, so it can carry the crew's own line breaks.
							<span className="whitespace-pre-line">{action.reachDescription}</span>
						)}
					</DetailRow>
					<DetailRow label="Date">{formatActionDate(action.outreachDate)}</DetailRow>
					<DetailRow label="Technician">{technicianName}</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={action.addressId} />
					</DetailRow>
				</DetailList>
				<AdditionalPersonnelList target={{ type: 'outreachAction', id: action.id }} />
			</CardContent>
		</Card>
	);
}
