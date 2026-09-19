import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';
import type { DashboardResponse } from '../../components/dashboard/dashboard-data';

/** Five minutes: the interval the server half is re-read on. */
const DASHBOARD_REFETCH_INTERVAL_MS = 5 * 60_000;

/**
 * The dashboard read, re-read every five minutes and when the tab regains
 * focus, keeping the previous answer while a new one loads.
 */
export function useDashboard(): {
	readonly data: DashboardResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
} {
	const query = useQuery({
		queryKey: ['dashboard'],
		queryFn: ({ signal }) => fetchDashboard(signal),
		// The app's default is `false`; this page is opened and left open, and
		// the tab coming back into focus is the moment a stale number matters.
		refetchOnWindowFocus: true,
		refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
		placeholderData: (previous) => previous,
	});

	return { data: query.data, isLoading: query.isLoading, isError: query.isError };
}

async function fetchDashboard(signal: AbortSignal): Promise<DashboardResponse> {
	const response = await sessionFetch(new URL('/dashboard', getServerUrl()), { signal });
	if (!response.ok) {
		throw new Error(`Dashboard request failed (${response.status}).`);
	}
	return (await response.json()) as DashboardResponse;
}
