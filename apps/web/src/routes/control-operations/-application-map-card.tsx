import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ContactIcon, InfoIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { MapCardAddress } from '../../components/linked-address';
import {
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardLocation,
} from '../../components/map/map-card';
import { useApplication } from '../../hooks/queries/use-application';
import { useApplicationBatchNames } from '../../hooks/queries/use-application-batch-names';
import { formatMeasure } from './-control-display';

const UnitIcon = iconRegistry.entities.unit.icon;
const MethodIcon = iconRegistry.entities.application.icon;

/**
 * The map focus card for a chemical application. One query brings the
 * application up with its product, method, unit, applicator and address already
 * joined ({@link useApplication}); the batch names come alongside it, keyed on
 * the same id the card was opened with.
 */
export function ApplicationMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const { application } = useApplication(id);
	const batchNames = useApplicationBatchNames(id);

	if (application === undefined) {
		return (
			<MapCard onClose={onClose} title="Application">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const methodName =
		application.methodId === null ? null : (application.methodName ?? 'Unknown method');

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={application.actionDate} type="Application" />}
			onClose={onClose}
			title={application.productName}
			viewDetailLink={(content) => (
				<Link params={{ id: application.id }} to="/control-operations/chemical/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={UnitIcon}>
					{formatMeasure(application.amountApplied, application.unitAbbreviation)}
				</MapCardDetail>
				{methodName === null ? null : <MapCardDetail icon={MethodIcon}>{methodName}</MapCardDetail>}
				{application.applicatorName === null ? null : (
					<MapCardDetail icon={ContactIcon}>{application.applicatorName}</MapCardDetail>
				)}
				{batchNames.length === 0 ? null : (
					<MapCardDetail icon={InfoIcon}>Batch {batchNames.join(', ')}</MapCardDetail>
				)}
				<MapCardAddress address={application.address} addressId={application.addressId} />
				<MapCardLocation
					geomType={application.geometryKind}
					lat={application.latitude}
					lng={application.longitude}
				/>
			</div>
		</MapCard>
	);
}
