import { useQuery } from '@tanstack/react-query';
import {
	fetchNearby,
	type NearbyRead,
} from '../../components/public-engagement/service-requests/service-request-nearby';
/**
 * The nearby records around a service request, scoped by the server's radius
 * and window, as the read the page's surfaces take.
 */
export function useServiceRequestNearby(id: string): NearbyRead {
	return useQuery({
		queryKey: ['service-request-nearby', id],
		queryFn: ({ signal }) => fetchNearby(id, signal),
		staleTime: 30_000,
	});
}
