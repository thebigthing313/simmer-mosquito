import { describe, expect, it } from 'vitest';
import { COLLECTION_STATUS_COLORS } from '../../../../../components/map';
import {
	collectionLegend,
	collectionStatusLabel,
} from '../../../../../routes/adult-surveillance/collections/-legend';

/**
 * The key names the colours the map can currently draw, and the rail's dot reads
 * the same table. The status itself is resolved server-side, so the only thing
 * that can drift here is which of the four the key admits to.
 */
describe('collectionLegend', () => {
	it('names every colour when nothing is filtered out', () => {
		expect(collectionLegend(false).map((entry) => entry.label)).toEqual([
			'Trap out',
			'Collected',
			'Zero result',
			'Problem reported',
		]);
	});

	it('names problems alone when that is all the map can draw', () => {
		expect(collectionLegend(true).map((entry) => entry.label)).toEqual(['Problem reported']);
	});

	it('takes its swatches from the colours the layer paints with', () => {
		expect(collectionLegend(false).map((entry) => entry.color)).toEqual([
			COLLECTION_STATUS_COLORS.pending,
			COLLECTION_STATUS_COLORS.collected,
			COLLECTION_STATUS_COLORS.zero_result,
			COLLECTION_STATUS_COLORS.problem,
		]);
	});

	// The rail's dot and the key have to name a status the same way, or the key
	// is describing something the row does not claim to be.
	it('labels a status the way the key does', () => {
		expect(collectionStatusLabel('pending')).toBe('Trap out');
		expect(collectionStatusLabel('zero_result')).toBe('Zero result');
	});
});
