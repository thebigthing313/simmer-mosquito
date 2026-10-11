/**
 * One biocontrol release, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * Three sequential queries before: the action, then its method, then its unit.
 */

import { eq } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { profiles } from '../../lib/collections/profiles';
import { units } from '../../lib/collections/units';
import type { BiocontrolAction } from './control-action-view';
import { controlActionBaseSelect, PERFORMED_ACTIONS } from './performed-action-reads';
import { addressSelect, joinedOrNull, useRecordById } from './shared';

const releaseReads = PERFORMED_ACTIONS.releases;

export function useBiocontrolAction(actionId: string | null): {
	readonly action: BiocontrolAction | undefined;
	readonly isReady: boolean;
	/**
	 * The subset failed. Distinct from a ready query with no row: the edit page
	 * offers a retry for one and "no such record" for the other, and a surface that
	 * conflated them would tell a user their action had been deleted.
	 */
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: biocontrol_actions(),
		id: actionId,
		query: (query) =>
			query
				// `left` throughout: a release need not record a technician and most
				// name no address.
				.join(
					{ method: biocontrol_methods() },
					({ record: action, method }) => releaseReads.joinMethod(action, method),
					'left',
				)
				.join(
					{ unit: units() },
					({ record: action, unit }) => releaseReads.joinUnit(action, unit),
					'left',
				)
				.join(
					{ technician: profiles() },
					({ record: action, technician }) => releaseReads.joinPerformer(action, technician),
					'left',
				)
				.join(
					{ address: addresses() },
					({ record: action, address }) => eq(action.address_id, address.id),
					'left',
				)
				.select(({ record: action, method, unit, technician, address }) => {
					const measured = releaseReads.measured(action);
					return {
						id: action.id,
						address: addressSelect(address),
						actionDate: releaseReads.date(action),

						methodId: measured.methodId,
						methodName: joinedOrNull(method.name),
						technicianProfileId: measured.performerProfileId,
						technicianName: joinedOrNull(technician.display_name),

						amountReleased: measured.amount,
						unitId: measured.unitId,
						unitAbbreviation: joinedOrNull(unit.abbreviation),
						habitatId: action.habitat_id,
						...controlActionBaseSelect(action),
					};
				}),
	});

	return { action: result.record, isReady: result.isReady, isError: result.isError };
}
