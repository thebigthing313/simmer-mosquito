/**
 * One Outreach Action, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * Two sequential queries before: the action, then the method that titles it.
 */

import { caseWhen, coalesce, eq, isNull } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { profiles } from '../../lib/collections/profiles';
import type { OutreachAction } from './outreach-view';
import { addressSelect, useRecordById } from './shared';

export function useOutreachAction(
	actionId: string | null,
	options?: { readonly gcTime?: number },
): {
	readonly action: OutreachAction | undefined;
	readonly isReady: boolean;
	/**
	 * The subset failed. Distinct from a ready query with no row: the edit page
	 * offers a retry for one and "no such record" for the other, and a surface that
	 * conflated them would tell a user their action had been deleted.
	 */
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: outreach_actions(),
		id: actionId,
		gcTime: options?.gcTime,
		query: (query) =>
			query
				// `left` throughout: outreach need not record a technician and most
				// name no address.
				.join(
					{ method: outreach_methods() },
					({ record: action, method }) => eq(action.outreach_method_id, method.id),
					'left',
				)
				.join(
					{ technician: profiles() },
					({ record: action, technician }) => eq(action.technician_profile_id, technician.id),
					'left',
				)
				.join(
					{ address: addresses() },
					({ record: action, address }) => eq(action.address_id, address.id),
					'left',
				)
				.select(({ record: action, method, technician, address }) => ({
					id: action.id,
					address: addressSelect(address),
					outreachDate: action.outreach_date,
					methodId: action.outreach_method_id,
					methodName: coalesce(method.name, 'Unknown method'),
					technicianProfileId: action.technician_profile_id,
					technicianName: caseWhen(
						isNull(action.technician_profile_id),
						null,
						technician.display_name,
					),
					reach: action.reach,
					reachDescription: action.reach_description,

					addressId: action.address_id,
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
	});

	return { action: result.record, isReady: result.isReady, isError: result.isError };
}
