import { describe, expect, it } from 'vitest';
import { inspectionLegend } from '../../../../../components/larval-surveillance/inspections/legend';
import {
	INSPECTION_DENSITY_COLORS,
	INSPECTION_DRY_COLOR,
	TILE_CLUSTER_COLOR,
} from '../../../../../components/map';

const labels = (...args: Parameters<typeof inspectionLegend>) =>
	inspectionLegend(...args).map((entry) => entry.label);

/**
 * The key names the colours the map can currently draw. Points take the
 * density ramp and clusters take one colour, because a cluster holds several
 * bands at once, so the cluster swatch follows the ramp under every filter.
 */
describe('inspectionLegend', () => {
	it('names the ramp, the dry tone and the cluster when nothing is filtered out', () => {
		expect(labels('all', new Set(), true)).toEqual([
			'Wet only',
			'Light',
			'Medium',
			'Heavy',
			'Very heavy',
			'Dry',
			'Inspection Group',
		]);
	});

	it('keeps the cluster swatch when Water Dry leaves one colour on the points', () => {
		expect(labels('dry', new Set(), true)).toEqual(['Dry', 'Inspection Group']);
	});

	it('takes its swatches from the colours the layers paint with', () => {
		expect(inspectionLegend('wet', new Set(['heavy']), true).map((entry) => entry.color)).toEqual([
			INSPECTION_DENSITY_COLORS.heavy,
			TILE_CLUSTER_COLOR,
		]);
		expect(inspectionLegend('dry', new Set(), true).map((entry) => entry.color)).toEqual([
			INSPECTION_DRY_COLOR,
			TILE_CLUSTER_COLOR,
		]);
	});
});
