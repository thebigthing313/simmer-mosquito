import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Link } from '@tanstack/react-router';
import type { TreatmentDetail } from '../../../hooks/queries/control-action-view';
import { AdditionalPersonnelList } from '../../additional-personnel-list';
import { LinkedAddressValueById } from '../../linked-address';
import { formatActionDate } from '../control-display';

/**
 * The visit's facts: date, method, applicator, rig, habitat and address, and
 * the Additional Personnel. Takes the Treatment and the habitat's name, `null`
 * when it names none.
 */
export function TreatmentDetailsCard({
	treatment,
	habitatName,
}: {
	readonly treatment: TreatmentDetail;
	readonly habitatName: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<DetailList>
					<DetailRow label="Date">{formatActionDate(treatment.actionDate)}</DetailRow>
					<DetailRow label="Method">{treatment.methodName}</DetailRow>
					<DetailRow label="Applicator">{treatment.applicatorName}</DetailRow>
					<DetailRow label="Vehicle">{treatment.vehicleName}</DetailRow>
					<DetailRow label="Equipment">{treatment.equipmentName}</DetailRow>
					<DetailRow label="Habitat">
						{treatment.habitatId === null ? null : (
							<Link
								className={recordLink()}
								params={{ id: treatment.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								{habitatName ?? 'Unknown habitat'}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={treatment.addressId} />
					</DetailRow>
				</DetailList>
				<AdditionalPersonnelList target={{ type: 'treatment', id: treatment.id }} />
			</CardContent>
		</Card>
	);
}
