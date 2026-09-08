import { mapFamily } from '@simmer-mosquito/design-tokens';
import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '../../../../routes/-activity-data';
import { dailyWorkLegend } from '../../../../routes/daily-work/-legend';

// The key names the families the day can actually draw, in the colours the layer
// paints with. A key listing a family with no pin on screen is a key that has to
// be ignored, and one that has to be ignored stops being read.

function entry(family: ActivityEntry['family']): ActivityEntry {
	return {
		category: 'inspection',
		family,
		involvement: 'primary',
		role: 'inspected',
		id: `record-${family}`,
		lat: 35.5,
		lng: -90.5,
		date: '2026-08-05',
		occurredAt: null,
		label: null,
		siteName: null,
		refId: null,
		methodRefId: null,
		amount: null,
		unitId: null,
		detail: null,
	};
}

describe('dailyWorkLegend', () => {
	it('names nothing for a day with no entries', () => {
		expect(dailyWorkLegend([])).toEqual([]);
	});

	it('names only the families the day recorded', () => {
		const legend = dailyWorkLegend([entry('larval'), entry('larval'), entry('control')]);
		expect(legend.map((row) => row.label)).toEqual(['Larval Surveillance', 'Control Actions']);
	});

	// The same order the log's family sections read in, so the key and the rail
	// are not two different orderings of the same four things.
	it('keeps the log’s family order rather than the order they arrived in', () => {
		const legend = dailyWorkLegend([entry('publicEngagement'), entry('adult'), entry('larval')]);
		expect(legend.map((row) => row.label)).toEqual([
			'Larval Surveillance',
			'Adult Surveillance',
			'Public Engagement',
		]);
	});

	it('takes its swatches from the colours the layer paints with', () => {
		expect(dailyWorkLegend([entry('adult')])).toEqual([
			{ color: mapFamily.adult, label: 'Adult Surveillance' },
		]);
	});
});
