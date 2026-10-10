/**
 * One source reduction, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * Three sequential queries before: the action, then its method, then its unit.
 */

import { eq } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { profiles } from '../../lib/collections/profiles';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { units } from '../../lib/collections/units';
import type { SourceReduction } from './control-action-view';
import { controlActionBaseSelect, PERFORMED_ACTIONS } from './performed-action-reads';
import { addressSelect, joinedOrNull, useRecordById } from './shared';

const reductionReads = PERFORMED_ACTIONS.sourceReductions;

export function useSourceReduction(
	actionId: string | null,
	options?: { readonly gcTime?: number },
): {
	readonly action: SourceReduction | undefined;
	readonly isReady: boolean;
	/**
	 * The subset failed. Distinct from a ready query with no row: the edit page
	 * offers a retry for one and "no such record" for the other, and a card that
	 * conflated them would tell a user their action had been deleted.
	 */
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: source_reductions(),
		id: actionId,
		gcTime: options?.gcTime,
		query: (query) =>
			query
				// `left` throughout: a source reduction need not record a technician and
				// most name no address.
				.join(
					{ method: source_reduction_methods() },
					({ record: action, method }) => reductionReads.joinMethod(action, method),
					'left',
				)
				.join(
					{ unit: units() },
					({ record: action, unit }) => reductionReads.joinUnit(action, unit),
					'left',
				)
				.join(
					{ technician: profiles() },
					({ record: action, technician }) => reductionReads.joinPerformer(action, technician),
					'left',
				)
				.join(
					{ address: addresses() },
					({ record: action, address }) => eq(action.address_id, address.id),
					'left',
				)
				.select(({ record: action, method, unit, technician, address }) => {
					const measured = reductionReads.measured(action);
					return {
						id: action.id,
						address: addressSelect(address),
						actionDate: reductionReads.date(action),

						methodId: measured.methodId,
						methodName: joinedOrNull(method.name),
						technicianProfileId: measured.performerProfileId,
						technicianName: joinedOrNull(technician.display_name),

						sourcesEliminated: measured.amount,
						unitId: measured.unitId,
						unitAbbreviation: joinedOrNull(unit.abbreviation),
						habitatId: action.habitat_id,
						...controlActionBaseSelect(action),
					};
				}),
	});

	return { action: result.record, isReady: result.isReady, isError: result.isError };
}
