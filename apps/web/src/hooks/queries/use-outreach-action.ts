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
import { controlActionBaseSelect, PERFORMED_ACTIONS } from './performed-action-reads';
import { addressSelect, useRecordById } from './shared';

const outreachReads = PERFORMED_ACTIONS.outreachActions;

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
					({ record: action, method }) => outreachReads.joinMethod(action, method),
					'left',
				)
				.join(
					{ technician: profiles() },
					({ record: action, technician }) => outreachReads.joinPerformer(action, technician),
					'left',
				)
				.join(
					{ address: addresses() },
					({ record: action, address }) => eq(action.address_id, address.id),
					'left',
				)
				.select(({ record: action, method, technician, address }) => {
					const measured = outreachReads.measured(action);
					return {
						id: action.id,
						address: addressSelect(address),
						outreachDate: outreachReads.date(action),

						methodId: measured.methodId,
						methodName: coalesce(method.name, 'Unknown method'),
						technicianProfileId: measured.performerProfileId,
						technicianName: caseWhen(
							isNull(measured.performerProfileId),
							null,
							technician.display_name,
						),

						reach: measured.amount,
						reachDescription: action.reach_description,
						...controlActionBaseSelect(action),
					};
				}),
	});

	return { action: result.record, isReady: result.isReady, isError: result.isError };
}
