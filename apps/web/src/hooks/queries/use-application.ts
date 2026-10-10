/**
 * One chemical application, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * ## What this replaces
 *
 * Seven queries, five of them sequential. The card read the application, then the
 * product, then the method, then the unit, then the applicator — each waiting on
 * the render before it — and then read *every batch of that product* to turn the
 * application's two or three batch ids into names.
 *
 * The five are one join. The batch names are {@link useApplicationBatchNames},
 * which joins the two batch tables directly rather than indexing one of them: it
 * needs the application id and nothing else, so it starts on the same render as
 * this query rather than after it.
 */

import { eq } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { application_methods } from '../../lib/collections/application_methods';
import { applications } from '../../lib/collections/applications';
import { equipment as equipmentCollection } from '../../lib/collections/equipment';
import { insecticides } from '../../lib/collections/insecticides';
import { profiles } from '../../lib/collections/profiles';
import { units } from '../../lib/collections/units';
import { vehicles } from '../../lib/collections/vehicles';
import type { ChemicalApplication } from './control-action-view';
import { controlActionBaseSelect, PERFORMED_ACTIONS } from './performed-action-reads';
import { addressSelect, joinedOrNull, useRecordById } from './shared';

const applicationReads = PERFORMED_ACTIONS.applications;

export function useApplication(
	applicationId: string | null,
	options?: { readonly gcTime?: number },
): {
	readonly application: ChemicalApplication | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: applications(),
		id: applicationId,
		gcTime: options?.gcTime,
		query: (query) =>
			query
				// `left` throughout: an application need not name a method or an
				// applicator, and most name no address. An `inner` join would drop the
				// row entirely rather than leave a field blank.
				.join(
					{ product: insecticides() },
					({ record: application, product }) => applicationReads.joinProduct(application, product),
					'left',
				)
				.join(
					{ method: application_methods() },
					({ record: application, method }) => applicationReads.joinMethod(application, method),
					'left',
				)
				.join(
					{ unit: units() },
					({ record: application, unit }) => applicationReads.joinUnit(application, unit),
					'left',
				)
				.join(
					{ applicator: profiles() },
					({ record: application, applicator }) =>
						applicationReads.joinPerformer(application, applicator),
					'left',
				)
				.join(
					{ address: addresses() },
					({ record: application, address }) => eq(application.address_id, address.id),
					'left',
				)
				// The rig, which the detail page names and the map card does not. Both
				// catalogs are eager, so joining them costs nothing either surface was
				// not already paying.
				.join(
					{ vehicle: vehicles() },
					({ record: application, vehicle }) => eq(application.vehicle_id, vehicle.id),
					'left',
				)
				.join(
					{ rig: equipmentCollection() },
					({ record: application, rig }) => eq(application.equipment_id, rig.id),
					'left',
				)
				.select(
					({ record: application, product, method, unit, applicator, address, vehicle, rig }) => {
						const measured = applicationReads.measured(application);
						return {
							id: application.id,
							address: addressSelect(address),
							actionDate: applicationReads.date(application),

							insecticideId: measured.productId,
							// `insecticide_id` is not nullable, so a `null` name only ever means
							// the product is not in the client.
							productName: joinedOrNull(product.trade_name),
							methodId: measured.methodId,
							methodName: joinedOrNull(method.name),
							applicatorProfileId: measured.performerProfileId,
							applicatorName: joinedOrNull(applicator.display_name),

							amountApplied: measured.amount,
							unitId: measured.unitId,
							unitAbbreviation: joinedOrNull(unit.abbreviation),

							vehicleId: application.vehicle_id,
							vehicleName: joinedOrNull(vehicle.vehicle_name),
							equipmentId: application.equipment_id,
							equipmentName: joinedOrNull(rig.equipment_name),
							habitatId: application.habitat_id,
							collectionId: application.collection_id,
							...controlActionBaseSelect(application),
						};
					},
				),
	});

	return { application: result.record, isReady: result.isReady, isError: result.isError };
}
