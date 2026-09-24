import { describe, expect, it } from 'vitest';
import {
	activeDatePresetId,
	type DatePreset,
	datePresetRange,
	startOfYear,
} from '../../../components/date-range-filter';

const THIS_YEAR: DatePreset = { id: 'year', label: 'This Year', days: 'year' };

describe('the This year preset', () => {
	it('runs from the first of January through today', () => {
		expect(datePresetRange(THIS_YEAR, '2026-09-15')).toEqual({
			from: '2026-01-01',
			to: '2026-09-15',
		});
	});

	it('reads the year off today, so it turns over on the first of January', () => {
		expect(startOfYear('2026-12-31')).toBe('2026-01-01');
		expect(startOfYear('2027-01-01')).toBe('2027-01-01');
	});

	it('lights when the range is this year to date and not otherwise', () => {
		expect(activeDatePresetId('2026-01-01', '2026-09-15', '2026-09-15')).toBe('year');
		// Last year's whole window is a range the reader set, not this preset.
		expect(activeDatePresetId('2025-01-01', '2026-09-15', '2026-09-15')).toBeNull();
	});
});
