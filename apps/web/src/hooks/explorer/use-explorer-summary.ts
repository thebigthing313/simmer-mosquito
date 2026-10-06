import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';
import { type RecordType, recordNoun } from '../../lib/record-nouns';
import { PAGE_SIZE, stableParamsKey } from './use-paged-map-resource';

/**
 * Over this many records in view the rail draws the summary rather than the
 * rows. The page size, so the rows only draw when they fit on one page.
 */
const SUMMARY_THRESHOLD = PAGE_SIZE;

/** One value of a grouping and how many records in view carry it. */
interface MapSummaryGroup {
	readonly value: string | boolean | null;
	readonly count: number;
}

/** What `/map/{surface}/summary` answers: the count, whole and per grouping. */
export interface MapSummary {
	readonly total: number;
	/** Keyed by grouping name, each list largest count first. */
	readonly groups: Readonly<Record<string, readonly MapSummaryGroup[]>>;
}

export interface ExplorerSummaryState {
	/** The page counted more than {@link SUMMARY_THRESHOLD}: draw this, not the rows. */
	readonly isShown: boolean;
	/** The last summary that answered, or null before the first. */
	readonly data: MapSummary | null;
	readonly isError: boolean;
	readonly retry: () => void;
}

/**
 * The in-view summary of a `/map/*` surface, asked for only once the page has
 * counted more records than fit on it.
 *
 * Reads `{path}/summary` under the page's own box and filters, without the
 * paging. The page request goes first and answers `total`, so a viewport
 * holding 100 or fewer records costs one request, as it did before the summary
 * existed. The previous summary stays up while the next one loads.
 */
export function useExplorerSummary({
	path,
	recordType,
	params,
	total,
	pageSettled,
	enabled,
}: {
	/** The list endpoint, e.g. `/map/habitats`. The summary is read under it. */
	readonly path: string;
	/** What the surface lists, which names a failed request. */
	readonly recordType: RecordType;
	/** The page's params, `bbox` included. */
	readonly params: Readonly<Record<string, string>>;
	/** The page's total, which decides whether a summary is wanted. */
	readonly total: number;
	/** The page has answered for these params, so `total` is theirs. */
	readonly pageSettled: boolean;
	/** False on a surface with no summary to draw. */
	readonly enabled: boolean;
}): ExplorerSummaryState {
	const isShown = enabled && total > SUMMARY_THRESHOLD;
	const query = useQuery({
		enabled: isShown && pageSettled,
		queryKey: [path, 'summary', stableParamsKey(params)],
		queryFn: ({ signal }) => fetchSummary(path, recordType, params, signal),
		placeholderData: (previous) => previous,
	});

	return {
		isShown,
		data: query.data ?? null,
		isError: query.isError,
		retry: () => {
			void query.refetch();
		},
	};
}

async function fetchSummary(
	path: string,
	recordType: RecordType,
	params: Readonly<Record<string, string>>,
	signal: AbortSignal,
): Promise<MapSummary> {
	const url = new URL(`${path}/summary`, getServerUrl());
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(
			`${recordNoun(recordType).titleMany} summary request failed (${response.status}).`,
		);
	}
	const body = (await response.json()) as Partial<MapSummary>;
	return {
		total: typeof body.total === 'number' ? body.total : 0,
		groups: body.groups ?? {},
	};
}
