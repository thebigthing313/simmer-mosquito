import {
	OVERVIEW_PERIOD_PARAM,
	type OverviewGrain,
	type OverviewResponse,
} from '@simmer-mosquito/domain';
import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';

/** Five minutes: the interval a period-in-review page is re-read on. */
const OVERVIEW_REFETCH_INTERVAL_MS = 5 * 60_000;

export interface OverviewRead {
	readonly data: OverviewResponse | undefined;
	readonly isLoading: boolean;
	readonly isFetching: boolean;
	readonly isError: boolean;
	/**
	 * The server answered 400 `overview_period_invalid`: the period is in its
	 * future though not in the client's, which is a clock a day ahead. The page
	 * rewrites to the current period on it, the way it does for a malformed one.
	 */
	readonly periodRefused: boolean;
}

/** The server's refusal of the period, told apart from every other failure. */
class OverviewPeriodRefusedError extends Error {
	constructor() {
		super('The server refused the period.');
		this.name = 'OverviewPeriodRefusedError';
	}
}

/**
 * `GET /overview/:grain` for one period, keyed on the grain and the period so
 * stepping to another period is a first load for it, re-read every five
 * minutes and when the tab regains focus. No refresh control: focus and the
 * interval are the cadence. `docs/today-spec.md`, "The client half".
 */
export function useOverview(grain: OverviewGrain, period: string): OverviewRead {
	const query = useQuery({
		queryKey: ['overview', grain, period],
		queryFn: ({ signal }) => fetchOverview(grain, period, signal),
		// The app's default is `false`; this page is opened every morning and
		// left open, and the tab coming back into focus is when a stale number
		// matters.
		refetchOnWindowFocus: true,
		refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: query.isError,
		periodRefused: query.error instanceof OverviewPeriodRefusedError,
	};
}

async function fetchOverview(
	grain: OverviewGrain,
	period: string,
	signal: AbortSignal,
): Promise<OverviewResponse> {
	const url = new URL(`/overview/${grain}`, getServerUrl());
	url.searchParams.set(OVERVIEW_PERIOD_PARAM[grain], period);
	const response = await sessionFetch(url, { signal });
	if (response.status === 400) {
		const body = (await response.json().catch(() => null)) as { error?: string } | null;
		if (body?.error === 'overview_period_invalid') {
			throw new OverviewPeriodRefusedError();
		}
	}
	if (!response.ok) {
		throw new Error(`Overview request failed (${response.status}).`);
	}
	return (await response.json()) as OverviewResponse;
}
