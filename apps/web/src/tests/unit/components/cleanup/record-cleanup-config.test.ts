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

function record(label: string): DuplicateRecord {
	return {
		id: label,
		label,
		detail: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		lat: null,
		lng: null,
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

	it('says the distance for a place group, which shares no value', () => {
		expect(duplicateGroupHeading(group({ reason: 'same_place', value: null }))).toBe(
			'Within ten metres',
		);
	});
});

describe('recordCountLabel', () => {
	it('agrees with the count', () => {
		expect(recordCountLabel(1, RECORD_CLEANUP_CONFIGS.address)).toBe('1 address');
		expect(recordCountLabel(3, RECORD_CLEANUP_CONFIGS.address)).toBe('3 addresses');
	});
});
