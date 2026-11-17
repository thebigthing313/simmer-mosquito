import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ContactIcon, InfoIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { TreatmentLine } from '../../hooks/queries/treatment-lines';
import { useApplicationBatchNames } from '../../hooks/queries/use-application-batch-names';
import { useTreatmentCard } from '../../hooks/queries/use-treatment-card';
import { listTreatmentLines } from '../../lib/list-treatment-lines';
import { recordNoun } from '../../lib/record-nouns';
import { MapCardAddress } from '../linked-address';
import { MapCard, MapCardDetail, MapCardEyebrow, MapCardLocation } from '../map/map-card';
import type { MapInset } from '../map/map-inset';
import { formatMeasure } from './control-display';

const UnitIcon = iconRegistry.entities.unit.icon;
const MethodIcon = iconRegistry.entities.application.icon;

/**
 * The map focus card for a Treatment: titled by its products, one detail line
 * per product with its amount and batches, then the method, applicator,
 * address and location. Takes the Treatment id ({@link useTreatmentCard}).
 */
export function ApplicationMapCard({
	id,
	inset,
	onClose,
}: {
	readonly id: string;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { treatment } = useTreatmentCard(id);

	if (treatment === undefined) {
		return (
			<MapCard inset={inset} onClose={onClose} title={recordNoun('treatment').title}>
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const methodName =
		treatment.methodId === null ? null : (treatment.methodName ?? 'Unknown method');

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={treatment.actionDate} recordType="treatment" />}
			inset={inset}
			onClose={onClose}
			title={
				treatment.lines.length === 0
					? recordNoun('treatment').title
					: listTreatmentLines(treatment.lines, productName)
			}
			viewDetailLink={(content) => (
				<Link params={{ id: treatment.id }} to="/control-operations/chemical/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				{treatment.lines.map((line) => (
					<TreatmentLineDetail key={line.id} line={line} named={treatment.lines.length > 1} />
				))}
				{methodName === null ? null : <MapCardDetail icon={MethodIcon}>{methodName}</MapCardDetail>}
				{treatment.applicatorName === null ? null : (
					<MapCardDetail icon={ContactIcon}>{treatment.applicatorName}</MapCardDetail>
				)}
				<MapCardAddress address={treatment.address} addressId={treatment.addressId} />
				<MapCardLocation
					geomType={treatment.geometryKind}
					lat={treatment.latitude}
					lng={treatment.longitude}
				/>
			</div>
		</MapCard>
	);
}

function productName(line: TreatmentLine): string {
	return line.insecticideName ?? 'Unknown insecticide';
}

/**
 * One product's amount, and the batches it drew from. A Treatment with more
 * than one product names the product on each line, because the title alone
 * does not say which amount is whose.
 */
function TreatmentLineDetail({
	line,
	named,
}: {
	readonly line: TreatmentLine;
	readonly named: boolean;
}) {
	const batchNames = useApplicationBatchNames(line.id);
	const amount = formatMeasure(line.amount, line.unitAbbreviation);
	return (
		<>
			<MapCardDetail icon={UnitIcon}>
				{named ? `${productName(line)} · ${amount}` : amount}
			</MapCardDetail>
			{batchNames.length === 0 ? null : (
				<MapCardDetail icon={InfoIcon}>Batch {batchNames.join(', ')}</MapCardDetail>
			)}
		</>
	);
}
