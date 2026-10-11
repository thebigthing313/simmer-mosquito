import { describe, expect, it } from 'vitest';
import { collectionLegend } from '../../../../components/adult-surveillance/collections/legend';
import { trapLegend } from '../../../../components/adult-surveillance/traps/legend';
import { habitatLegend } from '../../../../components/larval-surveillance/habitats/legend';
import { inspectionLegend } from '../../../../components/larval-surveillance/inspections/legend';
import { sampleLegend } from '../../../../components/larval-surveillance/samples/legend';
import { clusterLegendEntries, TILE_CLUSTER_COLOR } from '../../../../components/map';
import { serviceRequestLegend } from '../../../../components/public-engagement/service-requests/legend';

/**
 * Every key on a map that clusters, built with the shared setting on and off.
 * With it off no cluster is drawn, so a group swatch would name a colour that is
 * not on the map, which is what the Legend Truth Rule refuses.
 */
const keys = [
	['Traps', (clustered: boolean) => trapLegend('all', clustered), 'Trap Group'],
	['Collections', (clustered: boolean) => collectionLegend(false, clustered), 'Collection Group'],
	['Habitats', (clustered: boolean) => habitatLegend('all', 'all', clustered), 'Habitat Group'],
	[
		'Inspections',
		(clustered: boolean) => inspectionLegend('all', new Set(), clustered),
		'Inspection Group',
	],
	['Samples', (clustered: boolean) => sampleLegend('all', clustered), 'Sample Group'],
	[
		'Service Requests',
		(clustered: boolean) => serviceRequestLegend('all', clustered),
		'Service Request Group',
	],
] as const;

describe.each(keys)('the %s key', (_page, legend, group) => {
	it('ends on the group swatch, in the colour the cluster layer paints, while clustering', () => {
		expect(legend(true).at(-1)).toEqual({ color: TILE_CLUSTER_COLOR, label: group });
	});

	it('names no group with clustering off, and keeps every other entry', () => {
		const off = legend(false);
		expect(off.some((entry) => entry.color === TILE_CLUSTER_COLOR)).toBe(false);
		expect(off).toEqual(legend(true).slice(0, -1));
	});
});

describe('clusterLegendEntries', () => {
	it('reads the noun from the register, and draws nothing when not clustering', () => {
		expect(clusterLegendEntries('serviceRequest', true)).toEqual([
			{ color: TILE_CLUSTER_COLOR, label: 'Service Request Group' },
		]);
		expect(clusterLegendEntries('serviceRequest', false)).toEqual([]);
	});
});
