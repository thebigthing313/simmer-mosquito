import { describe, expect, it } from 'vitest';
import { changeSentence } from '../../../../components/dashboard/dashboard-data';
import { recordNoun } from '../../../../lib/record-nouns';

/**
 * The activity strip's cell as a screen reader hears it. Announced in drawn
 * order it was "622 Down 913 Inspections", which says neither what went down
 * nor against what.
 */
describe('changeSentence', () => {
	const inspections = recordNoun('inspection');

	it('names the count, the record and the comparison window', () => {
		expect(changeSentence(622, 1535, 'count', inspections)).toBe(
			'622 inspections, down 913 compared with the 7 days before',
		);
		expect(changeSentence(1200, 1000, 'percent', inspections)).toBe(
			'1,200 inspections, up 20% compared with the 7 days before',
		);
	});

	it('says no change, and a rise from nothing, in words', () => {
		expect(changeSentence(1, 1, 'count', inspections)).toBe(
			'1 inspection, no change from the 7 days before',
		);
		expect(changeSentence(4, 0, 'percent', inspections)).toBe(
			'4 inspections, up from none in the 7 days before',
		);
	});
});
