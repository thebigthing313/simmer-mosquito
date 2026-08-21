import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { MapCardAddress } from '../../components/linked-address';
import {
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardLocation,
} from '../../components/map/map-card';
import { useOutreachAction } from '../../hooks/queries/use-outreach-action';
import { formatReach } from './-public-engagement-display';

const ReachIcon = iconRegistry.entities.outreachAction.icon;

/**
 * The map focus card for an outreach action. One query brings the action up with
 * its method and address already joined ({@link useOutreachAction}).
 */
export function OutreachMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const { action } = useOutreachAction(id);

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

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={action.outreachDate} type="Outreach" />}
			onClose={onClose}
			title={action.methodName}
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
				<MapCardAddress address={action.address} addressId={action.addressId} />
				<MapCardLocation
					geomType={action.geometryKind}
					lat={action.latitude}
					lng={action.longitude}
				/>
			</div>
		</MapCard>
	);
}
