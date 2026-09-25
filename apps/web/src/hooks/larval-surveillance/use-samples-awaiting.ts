import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';

/** One sample awaiting identification, as returned by the overview read endpoint. */
export interface AwaitingSample {
	readonly id: string;
	readonly displayName: string | null;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	/** The parent inspection's Address, the rung below the Habitat name. */
	readonly addressDisplayName: string | null;
	/** The parent inspection's centroid — what titles a sample with no habitat. */
	readonly lat: number | null;
	readonly lng: number | null;
}

/** The preview length the overview asks the endpoint for. */
const AWAITING_SAMPLES_PREVIEW = 6;

/**
 * Recent samples awaiting identification since `sinceDate`, resolved by the
 * server: a preview of six and the total.
 */
export function useSamplesAwaiting(sinceDate: string): {
	readonly samples: readonly AwaitingSample[];
	readonly total: number;
	readonly isLoading: boolean;
	readonly isError: boolean;
} {
	const query = useQuery({
		queryKey: ['larval-overview', 'awaiting-samples', sinceDate, AWAITING_SAMPLES_PREVIEW],
		queryFn: ({ signal }) => fetchSamplesAwaiting(sinceDate, AWAITING_SAMPLES_PREVIEW, signal),
		placeholderData: (previous) => previous,
		staleTime: 30_000,
	});

	return {
		samples: query.data?.samples ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
		isError: query.isError,
	};
}

async function fetchSamplesAwaiting(
	sinceDate: string,
	limit: number,
	signal: AbortSignal,
): Promise<{ readonly total: number; readonly samples: AwaitingSample[] }> {
	const url = new URL('/larval-surveillance/samples/awaiting', getServerUrl());
	url.searchParams.set('since', sinceDate);
	url.searchParams.set('limit', String(limit));
	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Awaiting samples request failed (${response.status}).`);
	}
	return (await response.json()) as { readonly total: number; readonly samples: AwaitingSample[] };
}
