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
import type { MapInset } from '../../components/map/map-inset';
import { useBiocontrolAction } from '../../hooks/queries/use-biocontrol-action';
import { ContextBadge, formatMeasure } from './-control-display';

const UnitIcon = iconRegistry.entities.unit.icon;

/**
 * The map focus card for a biocontrol release. One query brings the action up
 * with its method, unit and address already joined ({@link useBiocontrolAction}).
 */
export function BiocontrolMapCard({
	id,
	inset,
	onClose,
}: {
	readonly id: string;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { action } = useBiocontrolAction(id);

	if (action === undefined) {
		return (
			<MapCard inset={inset} onClose={onClose} title="Biocontrol">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	return (
		<MapCard
			badges={<ContextBadge habitatId={action.habitatId} inspectionId={action.inspectionId} />}
			eyebrow={<MapCardEyebrow date={action.actionDate} type="Biocontrol" />}
			inset={inset}
			onClose={onClose}
			title={action.methodName}
			viewDetailLink={(content) => (
				<Link params={{ id: action.id }} to="/control-operations/biocontrol/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={UnitIcon}>
					{formatMeasure(action.amountReleased, action.unitAbbreviation)}
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
