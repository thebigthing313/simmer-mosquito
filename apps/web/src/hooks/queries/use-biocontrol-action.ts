/**
 * One biocontrol release, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * Three sequential queries before: the action, then its method, then its unit.
 */

import { caseWhen, coalesce, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { profiles } from '../../lib/collections/profiles';
import { units } from '../../lib/collections/units';
import type { BiocontrolAction } from './control-action-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export function useBiocontrolAction(
	actionId: string | null,
	options?: { readonly gcTime?: number },
): {
	readonly action: BiocontrolAction | undefined;
	readonly isReady: boolean;
	/**
	 * The subset failed. Distinct from a ready query with no row: the edit page
	 * offers a retry for one and "no such record" for the other, and a surface that
	 * conflated them would tell a user their action had been deleted.
	 */
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: options?.gcTime ?? mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ action: biocontrol_actions })
					.where(({ action }) => eq(action.id, actionId ?? unmatchableId))
					// `left` throughout: a release need not record a technician and most
					// name no address.
					.join(
						{ method: biocontrol_methods },
						({ action, method }) => eq(action.biocontrol_method_id, method.id),
						'left',
					)
					.join({ unit: units }, ({ action, unit }) => eq(action.release_unit_id, unit.id), 'left')
					.join(
						{ technician: profiles },
						({ action, technician }) => eq(action.technician_profile_id, technician.id),
						'left',
					)
					.join(
						{ address: addresses },
						({ action, address }) => eq(action.address_id, address.id),
						'left',
					)
					.select(({ action, method, unit, technician, address }) => ({
						id: action.id,
						address: {
							id: address.id,
							displayName: address.display_name,
							addressLine1: address.address_line_1,
							addressLine2: address.address_line_2,
							locality: address.locality,
							region: address.region,
							postalCode: address.postal_code,
						},
						actionDate: action.biocontrol_date,

						methodId: action.biocontrol_method_id,
						methodName: coalesce(method.name, 'Unknown method'),
						technicianProfileId: action.technician_profile_id,
						technicianName: caseWhen(
							isNull(action.technician_profile_id),
							null,
							technician.display_name,
						),

						amountReleased: action.amount_released,
						unitId: action.release_unit_id,
						unitAbbreviation: coalesce(unit.abbreviation, null),

						addressId: action.address_id,
						habitatId: action.habitat_id,
						inspectionId: action.inspection_id,
						requestedControlActionId: action.requested_control_action_id,
						missionItemId: action.mission_item_id,

						latitude: action.lat,
						longitude: action.lng,
						geometryKind: action.geom_type,
						metadata: action.metadata,
						createdAt: action.created_at,
						updatedAt: action.updated_at,
						createdByProfileId: action.created_by_profile_id,
						updatedByProfileId: action.updated_by_profile_id,
					})),
		},
		[actionId],
	);

	return { action: result.data[0], isReady: result.isReady, isError: result.isError };
}
