import { refusalSentence, sessionFetch } from '@simmer-mosquito/sync';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';
import { ActivityRequestError, type ActivityResponse } from '../../routes/-activity-data';

/**
 * Fetches one Profile's activity over a date range. The whole set, server
 * capped, with no paging. The previous log stays as placeholder data while a
 * new window loads, and a refusal is not retried.
 */
export function useProfileActivity(input: {
	readonly profileId: string | null;
	readonly dateFrom: string;
	readonly dateTo: string;
}) {
	const { profileId, dateFrom, dateTo } = input;
	return useQuery({
		queryKey: ['profile-activity', profileId, dateFrom, dateTo],
		queryFn: ({ signal }) => fetchProfileActivity(profileId as string, dateFrom, dateTo, signal),
		enabled: profileId !== null && dateFrom !== '' && dateTo !== '',
		staleTime: 30_000,
		// The person and the day are both in the key, so without this every change
		// of the day drops a populated log back to placeholder rows. The previous
		// log stays until the new one lands, which is what the rest of the
		// explorers do when the map moves.
		placeholderData: keepPreviousData,
		// A refusal is a permanent answer. Retried, it spends the backoff looking
		// like a slow load, and the operator never learns the window was refused.
		retry: (failureCount, error) =>
			!(error instanceof ActivityRequestError && error.refused) && failureCount < 2,
	});
}

async function fetchProfileActivity(
	profileId: string,
	dateFrom: string,
	dateTo: string,
	signal: AbortSignal,
): Promise<ActivityResponse> {
	const url = new URL(`/map/profiles/${profileId}/activity`, getServerUrl());
	url.searchParams.set('dateFrom', dateFrom);
	url.searchParams.set('dateTo', dateTo);

	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new ActivityRequestError(await refusalReason(response), response.status === 400);
	}
	return (await response.json()) as ActivityResponse;
}

/** The server's own explanation where it gave one; the status code otherwise. */
async function refusalReason(response: Response): Promise<string> {
	const fallback = `Activity request failed (${response.status}).`;
	try {
		return refusalSentence(await response.json(), fallback);
	} catch {
		// Not JSON; fall through to the status.
		return fallback;
	}
}
