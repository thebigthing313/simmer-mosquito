import { type RecordType, recordNoun } from '../../lib/record-nouns';
import { TILE_CLUSTER_COLOR } from './geometry-tiles';
import type { MapLegendEntry } from './map-legend';

/**
 * The key entry for a cluster circle on a map of one record type: `Trap Group`
 * on the Traps map, `Habitat Group` on the Habitats map.
 *
 * The swatch is the colour the cluster layer paints, which is one colour on
 * every map, and the noun is the register's, so the entry names the records
 * the circle stands for in the words the rest of the page uses.
 */
export function clusterLegendEntry(recordType: RecordType): MapLegendEntry {
	return { color: TILE_CLUSTER_COLOR, label: `${recordNoun(recordType).title} Group` };
}
