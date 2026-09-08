/**
 * Which years the summaries card offers as tabs.
 *
 * The years the station has readings in, plus whichever the user is on. The
 * second half exists for the frame after a write into a year the station had
 * nothing in: without it the tab the write just moved to would not be in the
 * list, and the card would snap back to the newest year the moment the write
 * failed or was refused.
 */

import { describe, expect, it } from 'vitest';
import { tabbedYears } from '../../../../../routes/gis/weather/-weather-summaries-card';

describe('tabbedYears', () => {
	it('offers the years the station has readings in', () => {
		expect(tabbedYears([2026, 2024], null)).toEqual([2026, 2024]);
	});

	it('adds the year the user is on, newest first', () => {
		expect(tabbedYears([2026, 2024], 2025)).toEqual([2026, 2025, 2024]);
		expect(tabbedYears([2024], 2026)).toEqual([2026, 2024]);
	});

	it('adds nothing when the year is already there', () => {
		expect(tabbedYears([2026, 2024], 2024)).toEqual([2026, 2024]);
	});

	it('gives a station with nothing recorded no tabs', () => {
		expect(tabbedYears([], null)).toEqual([]);
	});
});
