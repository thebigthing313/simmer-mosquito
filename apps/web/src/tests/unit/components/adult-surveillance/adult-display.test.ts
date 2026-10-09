import { describe, expect, it } from 'vitest';
import {
	collectionCrumb,
	collectionRowDate,
	collectionTitle,
	SPECIES_SEX_VALUES,
	SPECIES_STATUS_VALUES,
} from '../../../../components/adult-surveillance/adult-display';

/**
 * The collection's labels take the day the read hook hands up. Which day that
 * is, and how a stamped instant reads back, is `collection-day.test.tsx`.
 */
describe('the collection labels', () => {
	it('name a dated collection by its day', () => {
		expect(collectionTitle('2026-08-12')).toBe('August 12, 2026');
		expect(collectionCrumb('2026-08-12')).toBe('Collection · Aug 12, 2026');
		expect(collectionRowDate('2026-08-12')).toBe('Wed, Aug 12, 2026');
	});

	it('name a collection with no day as pending', () => {
		expect(collectionTitle(null)).toBe('Pending collection');
		expect(collectionCrumb(null)).toBe('Pending collection');
		expect(collectionRowDate(null)).toBe('Pending collection');
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
