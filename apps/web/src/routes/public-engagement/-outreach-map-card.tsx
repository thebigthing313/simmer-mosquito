import type { ControlMethodRow, OutreachActionRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { MapCardAddressById } from '../../components/linked-address';
import {
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardLocation,
} from '../../components/map/map-card';
import { webCollections } from '../../sync/webCollections';
import { formatReach } from './-public-engagement-display';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const ReachIcon = iconRegistry.entities.outreachAction.icon;

/**
 * The map focus card for an outreach action. Resolves the action off the
 * on-demand collection and its method off the eager catalog, then renders the
 * shared {@link MapCard}.
 */
export function OutreachMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const actionResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ action: webCollections.outreachActions })
					.where(({ action }) => eq(action.id, id))
					.findOne(),
		},
		[id],
	);
	const action = actionResult.data as OutreachActionRow | undefined;

	const methodId = action?.outreachMethodId ?? UNMATCHABLE_ID;
	const methodResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ method: webCollections.outreachMethods })
					.where(({ method }) => eq(method.id, methodId))
					.findOne(),
		},
		[methodId],
	);
	const method = methodResult.data as ControlMethodRow | undefined;

	if (action === undefined) {
		return (
			<MapCard onClose={onClose} title="Outreach">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const methodName = method?.name ?? 'Unknown method';

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={action.outreachDate} type="Outreach" />}
			onClose={onClose}
			title={methodName}
			viewDetailLink={(content) => (
				<Link params={{ id: action.id }} to="/public-engagement/outreach/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={ReachIcon}>
					{formatReach(action.reach)} reached
					{action.reachDescription === null ? '' : ` · ${action.reachDescription}`}
				</MapCardDetail>
				<MapCardAddressById addressId={action.addressId} />
				<MapCardLocation geomType={action.geomType} lat={action.lat} lng={action.lng} />
			</div>
		</MapCard>
	);
}
