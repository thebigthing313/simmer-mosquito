import { describe, expect, it } from 'vitest';
import { changeLabel, changeSentence } from '../../../../components/dashboard/dashboard-data';
import { recordNoun } from '../../../../lib/record-nouns';

/**
 * The activity strip's cell as a screen reader hears it. Announced in drawn
 * order it was "622 Down 913 Inspections", which says neither what went down
 * nor against what.
 */
describe('changeSentence', () => {
	const inspections = recordNoun('inspection');

	it('names the count, the record and the comparison window', () => {
		expect(changeSentence(622, 1535, 'count', inspections, 7)).toBe(
			'622 inspections, down 913 vs previous 7 days',
		);
		expect(changeSentence(1200, 1000, 'percent', inspections, 7)).toBe(
			'1,200 inspections, up 20% vs previous 7 days',
		);
	});

	it('says no change, and a rise from nothing, in words', () => {
		expect(changeSentence(1, 1, 'count', inspections, 7)).toBe(
			'1 inspection, no change from the previous 7 days',
		);
		expect(changeSentence(4, 0, 'percent', inspections, 7)).toBe(
			'4 inspections, up from none in the previous 7 days',
		);
	});

	it('names the window the strip was given rather than a week', () => {
		expect(changeSentence(3, 1, 'count', inspections, 14)).toBe(
			'3 inspections, up 2 vs previous 14 days',
		);
	});
});

describe('changeLabel', () => {
	it('signs the change, since one tone draws it either way', () => {
		expect(changeLabel(622, 1535, 'count').text).toBe('-913');
		expect(changeLabel(3, 1, 'count').text).toBe('+2');
		expect(changeLabel(1200, 1000, 'percent').text).toBe('+20%');
		expect(changeLabel(800, 1000, 'percent').text).toBe('-20%');
		expect(changeLabel(5, 5, 'count').text).toBe('0');
		expect(changeLabel(4, 0, 'percent').text).toBe('from 0');
	});
});
