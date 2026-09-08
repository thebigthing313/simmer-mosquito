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

import { caseWhen, coalesce, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { application_methods } from '../../lib/collections/application_methods';
import { applications } from '../../lib/collections/applications';
import { equipment as equipmentCollection } from '../../lib/collections/equipment';
import { insecticides } from '../../lib/collections/insecticides';
import { profiles } from '../../lib/collections/profiles';
import { units } from '../../lib/collections/units';
import { vehicles } from '../../lib/collections/vehicles';
import type { ChemicalApplication } from './control-action-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export function useApplication(
	applicationId: string | null,
	options?: { readonly gcTime?: number },
): {
	readonly application: ChemicalApplication | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: options?.gcTime ?? mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ application: applications() })
					.where(({ application }) => eq(application.id, applicationId ?? unmatchableId))
					// `left` throughout: an application need not name a method or an
					// applicator, and most name no address. An `inner` join would drop the
					// row entirely rather than leave a field blank.
					.join(
						{ product: insecticides() },
						({ application, product }) => eq(application.insecticide_id, product.id),
						'left',
					)
					.join(
						{ method: application_methods() },
						({ application, method }) => eq(application.application_method_id, method.id),
						'left',
					)
					.join(
						{ unit: units() },
						({ application, unit }) => eq(application.application_unit_id, unit.id),
						'left',
					)
					.join(
						{ applicator: profiles() },
						({ application, applicator }) => eq(application.applicator_profile_id, applicator.id),
						'left',
					)
					.join(
						{ address: addresses() },
						({ application, address }) => eq(application.address_id, address.id),
						'left',
					)
					// The rig, which the detail page names and the map card does not. Both
					// catalogs are eager, so joining them costs nothing either surface was
					// not already paying.
					.join(
						{ vehicle: vehicles() },
						({ application, vehicle }) => eq(application.vehicle_id, vehicle.id),
						'left',
					)
					.join(
						{ rig: equipmentCollection() },
						({ application, rig }) => eq(application.equipment_id, rig.id),
						'left',
					)
					.select(({ application, product, method, unit, applicator, address, vehicle, rig }) => ({
						id: application.id,
						address: {
							id: address.id,
							displayName: address.display_name,
							addressLine1: address.address_line_1,
							addressLine2: address.address_line_2,
							locality: address.locality,
							region: address.region,
							postalCode: address.postal_code,
						},
						actionDate: application.application_date,

						insecticideId: application.insecticide_id,
						// `insecticide_id` is not nullable, so there is no absent case to
						// carry — only the join not having resolved yet.
						productName: coalesce(product.trade_name, 'Unknown product'),
						methodId: application.application_method_id,
						// Guarded on the application's own column, so an application with no
						// method reads as `null` rather than as the `undefined` an unmatched
						// join yields.
						methodName: caseWhen(isNull(application.application_method_id), null, method.name),
						applicatorProfileId: application.applicator_profile_id,
						applicatorName: caseWhen(
							isNull(application.applicator_profile_id),
							null,
							applicator.display_name,
						),

						amountApplied: application.amount_applied,
						unitId: application.application_unit_id,
						unitAbbreviation: coalesce(unit.abbreviation, null),

						vehicleId: application.vehicle_id,
						vehicleName: caseWhen(isNull(application.vehicle_id), null, vehicle.vehicle_name),
						equipmentId: application.equipment_id,
						equipmentName: caseWhen(isNull(application.equipment_id), null, rig.equipment_name),
						addressId: application.address_id,
						habitatId: application.habitat_id,
						collectionId: application.collection_id,
						inspectionId: application.inspection_id,
						requestedControlActionId: application.requested_control_action_id,
						missionItemId: application.mission_item_id,

						latitude: application.lat,
						longitude: application.lng,
						geometryKind: application.geom_type,
						metadata: application.metadata,
						createdAt: application.created_at,
						updatedAt: application.updated_at,
						createdByProfileId: application.created_by_profile_id,
						updatedByProfileId: application.updated_by_profile_id,
					})),
		},
		[applicationId],
	);

	return { application: result.data[0], isReady: result.isReady, isError: result.isError };
}
