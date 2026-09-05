/**
 * The record a merge leaves behind.
 *
 * The rule this pins is one sentence: a merge proposes nothing that would
 * replace an answer the survivor already gives, and nothing that would lose an
 * answer only a retired record gives. Both halves fail silently if they break.
 * Getting the first wrong overwrites good data with a duplicate's stale copy;
 * getting the second wrong is the behaviour this module was added to fix, and it
 * looks exactly like a merge working correctly.
 *
 * The pool is the other half. Two rows for one person usually hold two real
 * phone numbers, and the merge that keeps both is the one that puts the second
 * in `alternate_phone`. That has to be offered and must never be proposed: a
 * retired record's preferred number being this person's alternate is a claim
 * about the person, and nothing in the data supports it.
 */

import { describe, expect, it } from 'vitest';
import {
	defaultMergeFieldSelections,
	type MergeFieldRow,
	mergeFieldProblems,
	mergeFieldRows,
	mergeFieldSummary,
	mergeFieldUpdates,
} from '../../../../components/cleanup/merge-field-plan';
import type { DuplicateRecord } from '../../../../hooks/use-merge-candidates';

const KEPT = '11111111-1111-4111-8111-111111111111';
const RETIRED = '22222222-2222-4222-8222-222222222222';
const ALSO_RETIRED = '33333333-3333-4333-8333-333333333333';

function record(
	id: string,
	label: string,
	fields: Readonly<Record<string, string | null>>,
): DuplicateRecord {
	return {
		id,
		label,
		detail: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		lat: null,
		lng: null,
		fields,
	};
}

function rowFor(rows: readonly MergeFieldRow[], column: string): MergeFieldRow | undefined {
	return rows.find((row) => row.field.column === column);
}

function deciding(rows: readonly MergeFieldRow[]): readonly string[] {
	return rows.filter((row) => row.needsDecision).map((row) => row.field.column);
}

describe('mergeFieldRows', () => {
	it('offers every field, not only the ones in dispute', () => {
		// The merge is the moment somebody is looking at the record, so the fields
		// nothing disagrees about are editable too.
		const target = record(KEPT, 'Ana Reyes', { contact_name: 'Ana Reyes' });
		const source = record(RETIRED, 'Ana Reyes', { contact_name: 'Ana Reyes' });

		const rows = mergeFieldRows('contact', target, [source]);

		expect(rows.map((row) => row.field.column)).toEqual([
			'contact_name',
			'company',
			'department',
			'title',
			'email',
			'preferred_phone',
			'alternate_phone',
		]);
	});

	it('asks about a field only where the merge would otherwise decide it', () => {
		const target = record(KEPT, 'Ana Reyes', {
			contact_name: 'Ana Reyes',
			company: 'City Works',
			title: null,
			email: 'a@example.org',
		});
		const source = record(RETIRED, 'A Reyes', {
			// Agrees: nothing to settle.
			contact_name: 'Ana Reyes',
			// Disagrees: the merge would keep the survivor's silently.
			company: 'County Works',
			// Only the retired record answers: the merge would drop it silently.
			title: 'Manager',
			// Only the survivor answers: nothing is at risk.
			email: null,
		});

		expect(deciding(mergeFieldRows('contact', target, [source]))).toEqual(['company', 'title']);
	});

	it('starts a field at the survivor value, and at a retired one only where it is blank', () => {
		const target = record(KEPT, 'Ana Reyes', { company: 'City Works', title: null });
		const source = record(RETIRED, 'A Reyes', { company: 'County Works', title: 'Manager' });

		const rows = mergeFieldRows('contact', target, [source]);

		expect(rowFor(rows, 'company')?.defaultValue).toBe('City Works');
		expect(rowFor(rows, 'title')?.defaultValue).toBe('Manager');
	});

	it('offers the other phone numbers in the set for the alternate', () => {
		// The case this exists for: two rows, two real numbers, and the merge that
		// keeps both puts the second one in the alternate.
		const target = record(KEPT, 'Ana Reyes', { preferred_phone: '555-0100' });
		const source = record(RETIRED, 'A Reyes', { preferred_phone: '555-0199' });

		const alternate = rowFor(mergeFieldRows('contact', target, [source]), 'alternate_phone');

		expect(alternate?.suggestions.map((suggestion) => suggestion.value)).toEqual([
			'555-0100',
			'555-0199',
		]);
		// Labelled with where it sits today, so the reader can see that taking it is
		// a claim about the person rather than a copy.
		expect(alternate?.suggestions[1]?.fromColumn).toBe('preferred_phone');
	});

	it('never proposes a borrowed value, only offers it', () => {
		// Nothing in the data says a retired record's preferred number is this
		// person's alternate, so the field starts empty and asks nothing.
		const target = record(KEPT, 'Ana Reyes', { preferred_phone: '555-0100' });
		const source = record(RETIRED, 'A Reyes', { preferred_phone: '555-0199' });

		const alternate = rowFor(mergeFieldRows('contact', target, [source]), 'alternate_phone');

		expect(alternate?.defaultValue).toBeNull();
		expect(alternate?.needsDecision).toBe(false);
	});

	it('does not pool fields that only look alike', () => {
		// A locality and a region are not interchangeable however similar the
		// columns are, so nothing offers one for the other.
		const target = record(KEPT, 'Depot', { locality: 'Marion', region: 'AR' });
		const source = record(RETIRED, 'Depot', { locality: 'Marion', region: 'AR' });

		const locality = rowFor(mergeFieldRows('address', target, [source]), 'locality');

		expect(locality?.suggestions.map((suggestion) => suggestion.value)).toEqual(['Marion']);
	});

	it('collapses the records that say the same thing into one suggestion', () => {
		const target = record(KEPT, 'Ana Reyes', { company: null });
		const first = record(RETIRED, 'A Reyes', { company: 'City Works' });
		const second = record(ALSO_RETIRED, 'Ana R', { company: 'City Works' });

		const company = rowFor(mergeFieldRows('contact', target, [first, second]), 'company');

		expect(company?.suggestions).toHaveLength(1);
		expect(company?.suggestions[0]?.recordIds).toEqual([RETIRED, ALSO_RETIRED]);
	});

	it('never carries a consent column', () => {
		// False is an answer rather than a blank, so the fill-the-empty-one rule
		// would raise a flag nobody gave.
		const target = record(KEPT, 'Ana Reyes', { wants_email: 'false' });
		const source = record(RETIRED, 'A Reyes', { wants_email: 'true' });

		const rows = mergeFieldRows('contact', target, [source]);

		expect(rowFor(rows, 'wants_email')).toBeUndefined();
		expect(deciding(rows)).toEqual([]);
	});

	it('reads a blank the same whether it is null, spaces or absent', () => {
		const target = record(KEPT, 'Ana Reyes', {});
		const spaces = record(RETIRED, 'A Reyes', { title: '   ' });

		expect(deciding(mergeFieldRows('contact', target, [spaces]))).toEqual([]);
	});
});

describe('mergeFieldUpdates', () => {
	it('sends nothing when the starting values are left alone', () => {
		// Naming a command with nothing to change is refused by the domain builder,
		// so sending the whole set would 400 every merge the user did not edit.
		const target = record(KEPT, 'Ana Reyes', { preferred_phone: '555-0100' });
		const source = record(RETIRED, 'A Reyes', { preferred_phone: '555-0199' });
		const rows = mergeFieldRows('contact', target, [source]);

		expect(mergeFieldUpdates('contact', target, defaultMergeFieldSelections(rows))).toEqual({
			intents: [],
			values: {},
		});
	});

	it('carries a value the survivor did not have, under the command that writes it', () => {
		const target = record(KEPT, 'Ana Reyes', { preferred_phone: null });
		const source = record(RETIRED, 'A Reyes', { preferred_phone: '555-0100' });
		const rows = mergeFieldRows('contact', target, [source]);

		const updates = mergeFieldUpdates('contact', target, defaultMergeFieldSelections(rows));

		expect(updates.values).toEqual({ preferred_phone: '555-0100' });
		// Communication rather than details: the phone number travels with consent.
		expect(updates.intents).toEqual(['publicEngagement.updateContactCommunication']);
	});

	it('carries a borrowed number into the field the user put it in', () => {
		const target = record(KEPT, 'Ana Reyes', { preferred_phone: '555-0100' });
		const source = record(RETIRED, 'A Reyes', { preferred_phone: '555-0199' });

		const updates = mergeFieldUpdates('contact', target, {
			preferred_phone: '555-0100',
			alternate_phone: '555-0199',
		});

		expect(updates.values).toEqual({ alternate_phone: '555-0199' });
		expect(source.id).toBe(RETIRED);
	});

	it('carries text the user typed that no record holds', () => {
		// Half the reason to open this is that the name is wrong on both rows.
		const target = record(KEPT, 'Ana Reyes', { contact_name: 'Ana Reyes' });

		expect(mergeFieldUpdates('contact', target, { contact_name: '  Ana Reyes-Cruz  ' })).toEqual({
			intents: ['publicEngagement.updateContactDetails'],
			values: { contact_name: 'Ana Reyes-Cruz' },
		});
	});

	it('reads typed spaces as clearing the field, not as a value', () => {
		const target = record(KEPT, 'Ana Reyes', { company: 'City Works' });

		expect(mergeFieldUpdates('contact', target, { company: '   ' })).toEqual({
			intents: ['publicEngagement.updateContactDetails'],
			values: { company: null },
		});
	});

	it('names each command once however many of its columns changed', () => {
		const target = record(KEPT, 'Ana Reyes', {});

		const updates = mergeFieldUpdates('contact', target, {
			company: 'City Works',
			title: 'Manager',
			email: 'a@example.org',
		});

		expect(updates.intents).toEqual([
			'publicEngagement.updateContactDetails',
			'publicEngagement.updateContactCommunication',
		]);
	});

	it('ignores a column outside the record type it was given', () => {
		const target = record(KEPT, 'Depot', { display_name: 'Depot' });

		expect(mergeFieldUpdates('address', target, { preferred_phone: '555-0100' })).toEqual({
			intents: [],
			values: {},
		});
	});
});

describe('mergeFieldProblems', () => {
	it('names a required field left empty, rather than letting the server refuse it', () => {
		expect(mergeFieldProblems('address', { display_name: '   ', locality: '' })).toEqual(['Name']);
	});

	it('says nothing about a field the caller never offered', () => {
		// An absent column is not an empty one: `mergeFieldUpdates` sends only what
		// it was given, so a column nobody edited keeps whatever the row holds.
		expect(mergeFieldProblems('address', { locality: '' })).toEqual([]);
	});

	it('says nothing about an optional field left empty', () => {
		expect(mergeFieldProblems('contact', { contact_name: '', company: '' })).toEqual([]);
	});
});

/**
 * The same register, read as one record rather than as a decision.
 *
 * The cleanup row shows what a merge can carry, so that a set can be judged
 * without opening every record in it. Reading the register here is what keeps
 * the row and the merge form from drifting: a column added for a merge shows up
 * on the row it is judged from, in the same place and under the same label.
 */
describe('mergeFieldSummary', () => {
	it('reads a contact back in the register order, without repeating the name', () => {
		expect(
			mergeFieldSummary(
				'contact',
				record(KEPT, 'Maria Alvarez', {
					contact_name: 'Maria Alvarez',
					company: 'Alvarez Property Mgmt',
					department: 'Operations',
					title: 'Manager',
					email: 'm.alvarez@example.com',
					preferred_phone: '(555) 214-8890',
					alternate_phone: '(555) 900-4417',
				}),
			),
		).toEqual([
			{ column: 'company', label: 'Company', value: 'Alvarez Property Mgmt' },
			{ column: 'department', label: 'Department', value: 'Operations' },
			{ column: 'title', label: 'Title', value: 'Manager' },
			{ column: 'email', label: 'Email', value: 'm.alvarez@example.com' },
			{ column: 'preferred_phone', label: 'Preferred phone', value: '(555) 214-8890' },
			{ column: 'alternate_phone', label: 'Alternate phone', value: '(555) 900-4417' },
		]);
	});

	it('reads an address back in the register order, without repeating the name', () => {
		expect(
			mergeFieldSummary(
				'address',
				record(KEPT, '412 Oak St', {
					display_name: '412 Oak St',
					address_line_1: '412 Oak St',
					address_line_2: 'Apt 3',
					locality: 'Marion',
					region: 'AR',
					postal_code: '72364',
				}),
			),
		).toEqual([
			{ column: 'address_line_1', label: 'Address line 1', value: '412 Oak St' },
			{ column: 'address_line_2', label: 'Address line 2', value: 'Apt 3' },
			{ column: 'locality', label: 'Locality', value: 'Marion' },
			{ column: 'region', label: 'Region', value: 'AR' },
			{ column: 'postal_code', label: 'Postal code', value: '72364' },
		]);
	});

	it('leaves out a column the record does not fill in, in every spelling of empty', () => {
		// Absent, null, empty and spaces are one answer. A labelled blank reads like
		// a different one, so none of them reach the row.
		expect(
			mergeFieldSummary(
				'contact',
				record(KEPT, 'Maria Alvarez', {
					contact_name: 'Maria Alvarez',
					company: null,
					department: '',
					title: '   ',
					email: 'm.alvarez@example.com',
				}),
			),
		).toEqual([{ column: 'email', label: 'Email', value: 'm.alvarez@example.com' }]);
	});

	it('says nothing for a record that fills in none of them, on both record types', () => {
		expect(mergeFieldSummary('contact', record(KEPT, 'Maria Alvarez', {}))).toEqual([]);
		expect(
			mergeFieldSummary('address', record(KEPT, '412 Oak St', { display_name: '412 Oak St' })),
		).toEqual([]);
	});
});
