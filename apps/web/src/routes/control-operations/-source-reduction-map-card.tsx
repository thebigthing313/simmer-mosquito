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
import { useSourceReduction } from '../../hooks/queries/use-source-reduction';
import { formatMeasure } from './-control-display';

const UnitIcon = iconRegistry.entities.unit.icon;

/**
 * The map focus card for a source-reduction action. One query brings the action
 * up with its method, unit and address already joined
 * ({@link useSourceReduction}).
 */
export function SourceReductionMapCard({
	id,
	inset,
	onClose,
}: {
	readonly id: string;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { action } = useSourceReduction(id);

	if (action === undefined) {
		return (
			<MapCard inset={inset} onClose={onClose} title="Source Reduction">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={action.actionDate} type="Source reduction" />}
			inset={inset}
			onClose={onClose}
			title={action.methodName}
			viewDetailLink={(content) => (
				<Link params={{ id: action.id }} to="/control-operations/source-reduction/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={UnitIcon}>
					{formatMeasure(action.sourcesEliminated, action.unitAbbreviation)}
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
