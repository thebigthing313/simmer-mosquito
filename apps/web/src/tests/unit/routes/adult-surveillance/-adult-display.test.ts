import { describe, expect, it } from 'vitest';
import { operationalDayAsInstant } from '../../../../lib/local-date';
import {
	collectionEffectiveDate,
	SPECIES_SEX_VALUES,
	SPECIES_STATUS_VALUES,
} from '../../../../routes/adult-surveillance/-adult-display';

/**
 * The two halves of an operational date, checked against each other.
 *
 * A collection's date is typed as a calendar day, widened to an instant to be
 * stored, and narrowed back to a calendar day to be read. Each half is correct
 * on its own terms and they were written months apart; what nothing covered was
 * whether they agree. They did not past ±12, which is issue #156.
 */
describe('a typed collection date, stamped and read back', () => {
	/** Long after every day stamped here, so the same-day clamp never applies. */
	const LONG_AFTER = new Date('2027-01-01T00:00:00.000Z');

	it('reads back as the day that was typed, in a zone past +12', () => {
		const typed = '2026-08-04';
		const zone = 'Pacific/Auckland';
		const collectedAt = operationalDayAsInstant(typed, zone, LONG_AFTER);
		expect(collectionEffectiveDate({ collectedAt, collectionDate: null }, zone)).toBe(typed);
	});

	it('agrees on the day a clamped same-day stamp falls on', () => {
		// Keyed at 09:00 local, so the stamp is now rather than the agency's
		// midday. Any instant that day answers the same question — that is what
		// makes the clamp safe.
		const zone = 'America/New_York';
		const morning = new Date('2026-08-04T13:00:00.000Z');
		const collectedAt = operationalDayAsInstant('2026-08-04', zone, morning);
		expect(collectionEffectiveDate({ collectedAt, collectionDate: null }, zone)).toBe('2026-08-04');
	});

	it('is the stamp that had to change, not the reader', () => {
		// The stamp this replaced, through the same reader in the same zone. If
		// anything puts midday UTC back, the test above starts failing and this
		// one says why.
		expect(
			collectionEffectiveDate(
				{ collectedAt: '2026-08-04T12:00:00.000Z', collectionDate: null },
				'Pacific/Auckland',
			),
		).toBe('2026-08-05');
	});
});

/**
 * Both lists are now derived from the register rather than typed out, and both
 * are read in order by the adult entry pickers. The register runs `male, female`
 * and `damaged, unfed, bloodfed, gravid`, which is neither of these.
 */
describe('the adult entry option lists', () => {
	it('offers female before male', () => {
		expect(SPECIES_SEX_VALUES).toEqual(['female', 'male']);
	});

	it('offers the physiological states first and damaged last', () => {
		expect(SPECIES_STATUS_VALUES).toEqual(['unfed', 'bloodfed', 'gravid', 'damaged']);
	});
});
