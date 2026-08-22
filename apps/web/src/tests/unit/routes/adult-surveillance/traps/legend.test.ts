import { describe, expect, it } from 'vitest';
import { TRAP_STATUS_COLORS } from '../../../../../components/map';
import { trapLegend } from '../../../../../routes/adult-surveillance/traps/-legend';

const labels = (status: 'all' | 'active' | 'inactive') =>
	trapLegend(status).map((entry) => entry.label);

/**
 * The key names the colours the map can currently draw. With the status pill
 * gone from the rows, the dot is the only thing reporting a trap's status, so a
 * key that lists a colour the layer is not painting is worse than none.
 */
describe('trapLegend', () => {
	it('names both colours when the status filter is open', () => {
		expect(labels('all')).toEqual(['Active', 'Inactive']);
	});

	it('names one colour when the status filter has narrowed to it', () => {
		expect(labels('active')).toEqual(['Active']);
		expect(labels('inactive')).toEqual(['Inactive']);
	});

	it('takes its swatches from the colours the layer paints with', () => {
		expect(trapLegend('all').map((entry) => entry.color)).toEqual([
			TRAP_STATUS_COLORS.active,
			TRAP_STATUS_COLORS.inactive,
		]);
	});
});
