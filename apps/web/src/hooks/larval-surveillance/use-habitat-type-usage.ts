import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';

export type UsageById = ReadonlyMap<string, number>;
const EMPTY_USAGE: UsageById = new Map();

/**
 * Active-habitat counts per habitat type, as a server aggregate, since
 * habitats sync on-demand.
 */
export function useHabitatTypeUsage(): {
	readonly usageById: UsageById;
	readonly isLoading: boolean;
} {
	const query = useQuery({
		queryKey: ['habitat-type-usage'],
		queryFn: ({ signal }) => fetchHabitatTypeUsage(signal),
		staleTime: 30_000,
	});
	return { usageById: query.data ?? EMPTY_USAGE, isLoading: query.isLoading };
}

async function fetchHabitatTypeUsage(signal: AbortSignal): Promise<UsageById> {
	const response = await sessionFetch(new URL('/map/habitats/type-usage', getServerUrl()), {
		signal,
	});
	if (!response.ok) {
		throw new Error(`Habitat type usage request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly usage?: readonly { readonly habitatTypeId: string; readonly activeCount: number }[];
	};
	return new Map((body.usage ?? []).map((row) => [row.habitatTypeId, row.activeCount]));
}
