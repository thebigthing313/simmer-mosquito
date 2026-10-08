/**
 * The Organization's stored map centre, or `null` when it has none.
 *
 * Not suspense: every map surface reads this, and a map is not worth holding
 * behind a fallback for a value that only moves where it opens. The row is
 * eager and the shell does not draw until it has arrived, so in the app the
 * answer is there on the first render; before that, and in a suite with no
 * organization row, it is `null` and the map opens on the continental US.
 */

import { useLiveQuery } from '@tanstack/react-db';
import type { OrganizationMapCenter } from '../../components/map/map-styles';
import { organizations } from '../../lib/collections/organizations';

export function useOrganizationMapCenter(): OrganizationMapCenter | null {
	const result = useLiveQuery((query) =>
		query.from({ organization: organizations() }).select(({ organization }) => ({
			lat: organization.map_center_lat,
			lng: organization.map_center_lng,
		})),
	);

	const row = result.data?.[0];
	return row === undefined || row.lat === null || row.lng === null
		? null
		: { lat: row.lat, lng: row.lng };
}
