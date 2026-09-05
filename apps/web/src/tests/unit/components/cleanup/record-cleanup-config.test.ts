/**
 * How a duplicate group names itself.
 *
 * Both cases here were found by looking at the page rather than at the code, and
 * both are the kind of thing that reads as a bug in the data.
 *
 * The comparison that groups records is blind to case and padding, so the key it
 * matched on is a flattened spelling: `113 north 2nd avenue, 1st floor` above
 * three rows that all say `113 North 2nd Avenue, 1st Floor`. A shared name is
 * therefore shown as the records write it. A shared email or phone is not, and
 * cannot be: a contact's label is their name, so the shared thing is only in the
 * key.
 */

import { describe, expect, it } from 'vitest';
import {
	addedOn,
	duplicateGroupHeading,
	RECORD_CLEANUP_CONFIGS,
	recordCountLabel,
} from '../../../../components/cleanup/record-cleanup-config';
import type { DuplicateGroup, DuplicateRecord } from '../../../../hooks/use-merge-candidates';

function group(overrides: Partial<DuplicateGroup>): DuplicateGroup {
	return {
		key: 'same_name:depot',
		reason: 'same_name',
		value: 'depot',
		records: [record('Depot'), record('DEPOT')],
		...overrides,
	};
}

function record(
	label: string,
	fields: Readonly<Record<string, string | null>> = {},
): DuplicateRecord {
	return {
		id: label,
		label,
		detail: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		lat: null,
		lng: null,
		fields,
	};
}

describe('duplicateGroupHeading', () => {
	it('spells a shared name the way the records do, not the way it was compared', () => {
		expect(duplicateGroupHeading(group({}))).toBe('Same name: Depot');
	});

	it('falls back to the compared key when the first record has no name', () => {
		// Habitats often have none, and a heading reading "Same name: " says less
		// than the flattened key does.
		const unnamed = group({ records: [record('   '), record('Depot')] });

		expect(duplicateGroupHeading(unnamed)).toBe('Same name: depot');
	});

	it('shows the compared value for an email, which is written in lower case anyway', () => {
		const emails = group({
			reason: 'same_email',
			value: 'a.reyes@example.org',
			records: [record('A Reyes'), record('Ana Reyes')],
		});

		expect(duplicateGroupHeading(emails)).toBe('Same email: a.reyes@example.org');
	});

	it('shows the compared digits for a phone, never the name of the contact', () => {
		// The trap: a contact's label is their name, so taking the heading off the
		// first record would head a phone group with a person.
		const phones = group({
			reason: 'same_phone',
			value: '5550100',
			records: [record('K Osei'), record('Kofi Osei')],
		});

		expect(duplicateGroupHeading(phones)).toBe('Same phone: 5550100');
	});

	it('spells a shared street the way the records write it, off the column', () => {
		// Same flattening as a name, and a different way out of it: an address is
		// labelled by its display name, so the properly spelled street is only in
		// the record's own field values.
		const streets = group({
			reason: 'same_street',
			value: '412 oak st',
			records: [
				record('Depot', { address_line_1: '412 Oak St' }),
				record('Rear entrance', { address_line_1: '412 OAK ST' }),
			],
		});

		expect(duplicateGroupHeading(streets)).toBe('Same street address: 412 Oak St');
	});

	it('falls back to the compared street when the first record does not carry one', () => {
		const streets = group({
			reason: 'same_street',
			value: '412 oak st',
			records: [record('Depot'), record('Rear entrance')],
		});

		expect(duplicateGroupHeading(streets)).toBe('Same street address: 412 oak st');
	});

	it('shows the pair for a coordinate group, which is already exact', () => {
		const placed = group({
			reason: 'same_coordinates',
			value: '35.5, -90.5',
			records: [record('Depot'), record('Rear entrance')],
		});

		expect(duplicateGroupHeading(placed)).toBe('Same coordinates: 35.5, -90.5');
	});
});

describe('recordCountLabel', () => {
	it('agrees with the count', () => {
		expect(recordCountLabel(1, RECORD_CLEANUP_CONFIGS.address)).toBe('1 address');
		expect(recordCountLabel(3, RECORD_CLEANUP_CONFIGS.address)).toBe('3 addresses');
	});
});

/**
 * Which day an instant was added on, and who gets to say.
 *
 * Two zones, and two that disagree about this instant, because one zone proves
 * nothing: a formatter reading the browser's zone passes a single-zone
 * assertion wherever the test runner happens to sit, which is what #156 found.
 * Two answers that differ cannot both come from one browser zone, so this fails
 * against a formatter that names no zone no matter where it runs.
 *
 * `2026-03-04T23:30:00Z` is late on the 4th across the Americas and already
 * midday on the 5th in New Zealand — the shape of the bug this pins, where two
 * readers of one cleanup page compared rows on dates that were never the
 * record's.
 */
describe('addedOn', () => {
	const ADDED = '2026-03-04T23:30:00.000Z';

	it('names the day the Organization was on, not the day the reader is on', () => {
		expect(addedOn(ADDED, 'Pacific/Auckland')).toBe('Mar 5, 2026');
		expect(addedOn(ADDED, 'America/Anchorage')).toBe('Mar 4, 2026');
	});

	it('says so rather than showing an Invalid Date when the stamp is unreadable', () => {
		expect(addedOn('', 'America/New_York')).toBe('an unknown date');
	});
});
