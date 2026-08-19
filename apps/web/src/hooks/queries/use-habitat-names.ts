/**
 * What to call each of a set of Habitats.
 *
 * The lookup every list of field records needs: an inspection, an application, a
 * source reduction and a service request all name the site they happened at by id,
 * and all of them want the same string back. Ten surfaces across four domains read
 * this one hook.
 *
 * A `Map` rather than rows — the one case `shared.ts` allows a `useMemo` for, since
 * a query returns rows and cannot return a lookup of them. The naming itself is
 * still a compiled `select`: see `habitat-view.ts` for why an unnamed Habitat reads
 * out its coordinates.
 *
 * ## The two bounds, which used to be invisible
 *
 * The ids are **deduplicated and capped at 500**. Neither was visible from a call
 * site, and both matter: the ids arrive from a list, so a window covering a route
 * walked weekly repeats the same handful of Habitats hundreds of times, and an `IN`
 * naming every one of them is a subset request asking for work it does not need.
 * Past the cap a Habitat simply has no entry, and the call site's own fallback
 * shows instead — a wider window degrades to unnamed rows rather than to a request
 * that fails.
 *
 * The cap is a real ceiling, not a safety margin, so it is written here rather than
 * left to each caller to remember. If a surface ever needs more than 500 sites
 * named at once, that surface wants a server read, not a bigger number.
 */

import { coalesce, concat, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { habitats } from '../../lib/collections/habitats';
import { activityGcTimeMs, unmatchableId } from './shared';

/** How many Habitats one subset will name. See above — a ceiling, not a margin. */
const maxHabitatNameIds = 500;

export function useHabitatNames(ids: readonly string[]): ReadonlyMap<string, string> {
	// Sorted as well as deduplicated so that the same set of ids in a different
	// order is the same query key, and re-renders that reshuffle a list do not
	// look like a new subset.
	const sorted = [...new Set(ids)].sort().slice(0, maxHabitatNameIds);
	const idsKey = sorted.join(',');

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ habitat: habitats })
					.where(({ habitat }) => inArray(habitat.id, sorted.length > 0 ? sorted : [unmatchableId]))
					.select(({ habitat }) => ({
						id: habitat.id,
						name: coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
					})),
		},
		[idsKey],
	);

	const rows = result.data;

	return useMemo(() => new Map(rows.map((habitat) => [habitat.id, habitat.name] as const)), [rows]);
}
