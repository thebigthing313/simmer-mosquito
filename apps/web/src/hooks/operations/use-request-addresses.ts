import { inArray, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';
import type { OpenServiceRequest } from './use-open-service-requests';

/**
 * The display names of the addresses the given open requests name themselves
 * by, keyed by address id, over a bounded `addresses` subset.
 */
export function useRequestAddresses(
	requests: readonly OpenServiceRequest[],
): ReadonlyMap<string, string> {
	const addressIds = [...new Set(requests.map((request) => request.addressId))];

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ address: addresses() })
				.where(({ address }) =>
					inArray(address.id, addressIds.length > 0 ? addressIds : [unmatchableId]),
				)
				.select(({ address }) => ({ id: address.id, displayName: address.display_name })),
	});

	return new Map(result.data.map((address) => [address.id, address.displayName]));
}
