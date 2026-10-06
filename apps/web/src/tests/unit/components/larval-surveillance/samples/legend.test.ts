import { describe, expect, it } from 'vitest';
import { sampleLegend } from '../../../../../components/larval-surveillance/samples/legend';
import { SAMPLE_STATUS_COLORS, TILE_CLUSTER_COLOR } from '../../../../../components/map';

/**
 * The key names the colours the map can currently draw. A cluster can hold
 * samples in every status, so it takes one colour of its own and its swatch
 * stays under every filter.
 */
describe('sampleLegend', () => {
	it('names every status and the cluster when nothing is filtered out', () => {
		expect(sampleLegend('all', true).map((entry) => entry.label)).toEqual([
			'Awaiting ID',
			'Identified',
			'No larvae',
			'Unidentifiable',
			'Sample Group',
		]);
	});

	it('names one status and the cluster when the filter has narrowed to it', () => {
		expect(sampleLegend('identified', true).map((entry) => entry.label)).toEqual([
			'Identified',
			'Sample Group',
		]);
	});

	it('takes its swatches from the colours the layers paint with', () => {
		expect(sampleLegend('awaiting', true).map((entry) => entry.color)).toEqual([
			SAMPLE_STATUS_COLORS.awaiting,
			TILE_CLUSTER_COLOR,
		]);
	});
});
