import { describe, expect, it } from 'vitest';
import { HABITAT_STATUS_COLORS } from '../../../../../components/map';
import { habitatLegend } from '../../../../../routes/larval-surveillance/habitats/-legend';

const labels = (
	status: 'all' | 'active' | 'inactive',
	access: 'all' | 'accessible' | 'inaccessible',
) => habitatLegend(status, access).map((entry) => entry.label);

/**
 * The key names the colours the map can currently draw. The paint expression
 * reads inaccessible before active, which is what makes the Access filter able
 * to remove a colour the Status filter would otherwise keep.
 */
describe('habitatLegend', () => {
	it('names every colour when nothing is filtered out', () => {
		expect(labels('all', 'all')).toEqual(['Active', 'Inactive', 'Inaccessible']);
	});

	it('drops inactive when the Status filter excludes it', () => {
		expect(labels('active', 'all')).toEqual(['Active', 'Inaccessible']);
	});

	it('drops active when the Status filter excludes it', () => {
		expect(labels('inactive', 'all')).toEqual(['Inactive', 'Inaccessible']);
	});

	it('drops inaccessible when the Access filter excludes it', () => {
		expect(labels('all', 'accessible')).toEqual(['Active', 'Inactive']);
	});

	it('names inaccessible alone when that is all the map can draw', () => {
		expect(labels('all', 'inaccessible')).toEqual(['Inaccessible']);
		expect(labels('active', 'inaccessible')).toEqual(['Inaccessible']);
	});

	it('takes its swatches from the colours the layer paints with', () => {
		expect(habitatLegend('all', 'all').map((entry) => entry.color)).toEqual([
			HABITAT_STATUS_COLORS.active,
			HABITAT_STATUS_COLORS.inactive,
			HABITAT_STATUS_COLORS.inaccessible,
		]);
	});
});
