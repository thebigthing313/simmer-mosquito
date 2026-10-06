import { type RecordType, recordNoun } from '../../lib/record-nouns';
import { TILE_CLUSTER_COLOR } from './geometry-tiles';
import type { MapLegendEntry } from './map-legend';

/**
 * The key entry for a cluster circle on a map of one record type, `Trap Group`
 * on the Traps map and `Habitat Group` on the Habitats map, or none when the map
 * is not clustering.
 *
 * `clustered` is the shared clustering setting. With it off no cluster is drawn,
 * so a swatch would name a colour that is not on the map. The swatch is the
 * colour the cluster layer paints, one colour on every map, and the noun is the
 * register's, so the entry names the records the circle stands for in the words
 * the rest of the page uses.
 */
export function clusterLegendEntries(
	recordType: RecordType,
	clustered: boolean,
): readonly MapLegendEntry[] {
	return clustered
		? [{ color: TILE_CLUSTER_COLOR, label: `${recordNoun(recordType).title} Group` }]
		: [];
}
