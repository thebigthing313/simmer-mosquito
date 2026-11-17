/**
 * One Treatment by id, with everything its detail page and edit form read: the
 * method, applicator, address, rig, Formulation and mix unit joined, and its
 * products through the correlated line include on `treatment_id`. Takes the
 * Treatment id, or `null` for none.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { application_methods } from '../../lib/collections/application_methods';
import { equipment as equipmentCollection } from '../../lib/collections/equipment';
import { formulations } from '../../lib/collections/formulations';
import { profiles } from '../../lib/collections/profiles';
import { treatments } from '../../lib/collections/treatments';
import { units } from '../../lib/collections/units';
import { vehicles } from '../../lib/collections/vehicles';
import type { TreatmentDetail } from './control-action-view';
import { controlActionBaseSelect, PERFORMED_ACTIONS } from './performed-action-reads';
import { addressSelect, joinedOrNull, liveQueryGcTimeMs, unmatchableId } from './shared';
import { linesOf, treatmentLines } from './treatment-lines';

const treatmentReads = PERFORMED_ACTIONS.treatments;

export function useTreatment(treatmentId: string | null): {
	readonly treatment: TreatmentDetail | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ treatment: treatments() })
				.where(({ treatment }) => eq(treatment.id, treatmentId ?? unmatchableId))
				// `left` throughout: a Treatment need not name a method, an applicator,
				// a rig or a Formulation, and most name no address.
				.join(
					{ method: application_methods() },
					({ treatment, method }) => treatmentReads.joinMethod(treatment, method),
					'left',
				)
				.join(
					{ applicator: profiles() },
					({ treatment, applicator }) => treatmentReads.joinPerformer(treatment, applicator),
					'left',
				)
				.join(
					{ address: addresses() },
					({ treatment, address }) => eq(treatment.address_id, address.id),
					'left',
				)
				.join(
					{ vehicle: vehicles() },
					({ treatment, vehicle }) => eq(treatment.vehicle_id, vehicle.id),
					'left',
				)
				.join(
					{ rig: equipmentCollection() },
					({ treatment, rig }) => eq(treatment.equipment_id, rig.id),
					'left',
				)
				.join(
					{ formulation: formulations() },
					({ treatment, formulation }) => eq(treatment.formulation_id, formulation.id),
					'left',
				)
				.join(
					{ mixUnit: units() },
					({ treatment, mixUnit }) => eq(treatment.mix_unit_id, mixUnit.id),
					'left',
				)
				.select(
					({ treatment, method, applicator, address, vehicle, rig, formulation, mixUnit }) => {
						const measured = treatmentReads.measured(treatment);
						return {
							id: treatment.id,
							address: addressSelect(address),
							actionDate: treatmentReads.date(treatment),
							methodId: measured.methodId,
							methodName: joinedOrNull(method.name),
							applicatorProfileId: measured.performerProfileId,
							applicatorName: joinedOrNull(applicator.display_name),
							vehicleId: treatment.vehicle_id,
							vehicleName: joinedOrNull(vehicle.vehicle_name),
							equipmentId: treatment.equipment_id,
							equipmentName: joinedOrNull(rig.equipment_name),
							habitatId: treatment.habitat_id,
							collectionId: treatment.collection_id,
							formulationId: treatment.formulation_id,
							formulationName: joinedOrNull(formulation.formulation_name),
							mixAmount: treatment.mix_amount,
							mixUnitId: treatment.mix_unit_id,
							mixUnitAbbreviation: joinedOrNull(mixUnit.abbreviation),
							lines: treatmentLines(query, treatment),
							...controlActionBaseSelect(treatment),
						};
					},
				),
	});

	const row = result.data[0];
	return {
		treatment:
			row === undefined ? undefined : ({ ...row, lines: linesOf(row.lines) } as TreatmentDetail),
		isReady: result.isReady,
		isError: result.isError,
	};
}
