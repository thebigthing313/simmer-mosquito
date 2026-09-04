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
import type { ReactNode } from 'react';
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
import { useOutreachActionMutations } from '../../../hooks/mutations/use-outreach-action-mutations';
import type { OutreachAction } from '../../../hooks/queries/outreach-view';
import { useOutreachMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useOutreachAction } from '../../../hooks/queries/use-outreach-action';
import { OUTREACH_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { CONTROL_ACTION_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { formatActionDate } from '../../control-operations/-control-display';
import { formatReach } from '../-public-engagement-display';

const OutreachIcon = iconRegistry.entities.outreachAction.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const outreachGcTimeMs = 30_000;

export const Route = createFileRoute('/public-engagement/outreach/$id')({
	component: RouteComponent,
});

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { eyebrow: 'w-20', main: ['h-[360px]'], aside: ['h-72'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// One query for the action, its method, technician and address — the lookups
	// this page used to do for itself. `outreach_actions` is on-demand, so this is
	// status-gated rather than suspending; see the hook.
	const { action, isReady, isError } = useOutreachAction(id, { gcTime: outreachGcTimeMs });

	return (
		<RecordDetailPage
			back={{ label: 'Back to outreach', to: '/public-engagement/outreach' }}
			deleteRefusals={CONTROL_ACTION_DELETE_REFUSALS}
			layout={layout}
			noun="outreach action"
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
		<RecordDetailColumns
			aside={
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
					<CommentsSection
						description="Follow-up, materials, and response notes for this outreach."
						target={{ type: 'outreachAction', id: action.id }}
					/>
				</>
			}
			header={
				<RecordDetailHeader
					actions={
						<WriteOnly>
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: action.id }} to="/public-engagement/outreach/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit
								</Link>
							</Button>
						</WriteOnly>
					}
					eyebrow="Outreach"
					icon={OutreachIcon}
					subtitle={`${formatReach(action.reach)} reached on ${formatActionDate(action.outreachDate)}`}
					title={methodName}
				/>
			}
			layout={layout}
		>
			<div className="grid content-start gap-3">
				<OutreachLocationCard action={action} />
				<RecordRegionsBand
					noun="outreach action"
					recordId={action.id}
					recordType="outreach_actions"
				/>
			</div>
			<DangerZoneCard
				ask={askDelete}
				name={methodName}
				noun="outreach action"
				onDelete={(acknowledgements) => remove(action.id, acknowledgements)}
				recordId={action.id}
				recordType="outreachAction"
				returnTo="/public-engagement/outreach"
			/>
		</RecordDetailColumns>
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
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Reached">{formatReach(action.reach)}</DetailRow>
					<DetailRow label="Who">
						{action.reachDescription === null ? (
							<EmptyValue />
						) : (
							// Written in a textarea, so it can carry the crew's own line breaks.
							<span className="whitespace-pre-line">{action.reachDescription}</span>
						)}
					</DetailRow>
					<DetailRow label="Date">{formatActionDate(action.outreachDate)}</DetailRow>
					<DetailRow label="Technician">
						{technicianName ?? <span className="text-muted-foreground">Unassigned</span>}
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={action.addressId} />
					</DetailRow>
				</dl>
				<AdditionalPersonnelList target={{ type: 'outreachAction', id: action.id }} />
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
