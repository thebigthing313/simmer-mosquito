/**
 * What the larval overview reads that is larval surveillance's own.
 *
 * The date helpers this module used to define, and re-export to the adult,
 * control-operations and public-engagement overviews through a shim apiece, are
 * in `lib/local-date` beside `todayInTimeZone` (#906). A week strip and a list
 * date are not facts about this domain, and three route trees importing a
 * route-private module is how one becomes a shared library nobody named.
 *
 * What is left is the two live-data reads no other domain has: larvae totals by
 * species off the on-demand `sample_species` shape, and the samples awaiting
 * identification, which come from a server endpoint rather than a client-side
 * join. The window each panel reads by is in `index.tsx` beside the panels.
 */

import { sessionFetch } from '@simmer-mosquito/sync';
import { gte, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';
import type { SpeciesTotal } from '../../components/species-composition-panel';
import { activityGcTimeMs } from '../../hooks/queries/shared';
import { useSpeciesNames } from '../../hooks/queries/use-species-names';
import { sample_species } from '../../lib/collections/sample_species';

// --- projected query shapes -------------------------------------------------

/** One sample awaiting identification, as returned by the overview read endpoint. */
export interface AwaitingSample {
	readonly id: string;
	readonly displayName: string | null;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	/** The parent inspection's centroid — what titles a sample with no habitat. */
	readonly lat: number | null;
	readonly lng: number | null;
}

interface LoadState {
	readonly isReady: boolean;
	readonly isError: boolean;
}

// --- live-data hooks --------------------------------------------------------

// Inspection queries stay deliberately flat — a single on-demand subset keyed on
// `inspection_date` — rather than nesting samples/species includes: a nested
// include fans out an Electric subset request over every inspection id in the
// window, whose URL exceeds request limits and fails. Sample-derived panels read
// from a server endpoint instead ({@link useSamplesAwaiting}).
//
// All use the status-gated {@link useLiveQuery} (not the suspense variant) because
// the suspense hook hangs after a navigation unmount over on-demand collections.

/**
 * The ranked totals themselves, beside the hook rather than inside it.
 *
 * A row with no larvae counted contributes nothing, so an inspection that found
 * a species and recorded no number does not read as a zero-count species.
 */
function speciesTotals(
	rows: readonly { readonly speciesId: string; readonly larvaeCount: number | null }[],
	nameById: ReadonlyMap<string, string>,
): { readonly totals: readonly SpeciesTotal[]; readonly grandTotal: number } {
	const byId = new Map<string, number>();
	let sum = 0;
	for (const row of rows) {
		const count = row.larvaeCount ?? 0;
		if (count <= 0) {
			continue;
		}
		byId.set(row.speciesId, (byId.get(row.speciesId) ?? 0) + count);
		sum += count;
	}
	const ranked: SpeciesTotal[] = [...byId.entries()]
		.map(([speciesId, total]) => ({
			speciesId,
			total,
			name: nameById.get(speciesId) ?? 'Unknown species',
		}))
		.sort((first, second) => second.total - first.total);
	return { totals: ranked, grandTotal: sum };
}

/**
 * Larvae totals by species over the given window (identified_at based), sorted
 * high to low. Species names resolve from the eager `species` catalog.
 */
export function useSpeciesComposition(sinceDate: string): {
	readonly totals: readonly SpeciesTotal[];
	readonly grandTotal: number;
} & LoadState {
	const nameById = useSpeciesNames();

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ identification: sample_species() })
				.where(({ identification }) => gte(identification.identified_at, sinceDate))
				.select(({ identification }) => ({
					speciesId: identification.species_id,
					larvaeCount: identification.larvae_count,
				})),
	});

	const rows = result.data;

	const { totals, grandTotal } = speciesTotals(rows, nameById);

	return { totals, grandTotal, isReady: result.isReady, isError: result.isError };
}

// --- samples awaiting identification (server read endpoint) -----------------

/** The preview length the overview asks the endpoint for. */
const AWAITING_SAMPLES_PREVIEW = 6;

/**
 * Recent samples awaiting identification, resolved by the server rather than a
 * client-side join: the awaiting set spans every habitat in the window, which a
 * nested on-demand include can't gather in one bounded request.
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
