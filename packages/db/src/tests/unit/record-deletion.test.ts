import { describe, expect, it } from 'vitest';
import { deletableRecordLabel, deletableRecordTypes, isDeletableRecordType } from '../../index.js';

/**
 * Every record type the delete-impact endpoint accepts.
 *
 * This is a lock on the server registry, not a comparison against the client:
 * `apps/web` restates the subset it has detail pages for in
 * `hooks/use-delete-impact.ts` (today, all of these but `mission` and
 * `requestedControlAction`, which have delete endpoints and no page), and the
 * browser bundle cannot import this package to be checked against it. Pinning
 * the list means adding a deletable record fails this test, which is the prompt
 * to decide whether the client needs it too.
 */
const EXPECTED_TYPES = [
	'address',
	'assignment',
	'application',
	'biocontrolAction',
	'collection',
	'contact',
	'habitat',
	'inspection',
	'mission',
	'outreachAction',
	'region',
	'requestedControlAction',
	'route',
	'sample',
	'serviceRequest',
	'sourceReduction',
	'trap',
];

describe('deletable record registry', () => {
	it('accepts exactly the record types it declares', () => {
		expect([...deletableRecordTypes()].sort()).toEqual([...EXPECTED_TYPES].sort());
	});

	it('names every record in domain language', () => {
		for (const recordType of deletableRecordTypes()) {
			const label = deletableRecordLabel(recordType);
			expect(label.trim()).not.toBe('');
			// The label reaches the user through `RecordDeleteBlockedError`, so a
			// multi-word type that never got one would leak `requestedControlAction`
			// into a sentence an agency reads.
			expect(label).not.toMatch(/[A-Z]/);
		}
	});

	it('rejects a record type it does not know', () => {
		expect(isDeletableRecordType('habitat')).toBe(true);
		expect(isDeletableRecordType('weatherStation')).toBe(false);
		expect(isDeletableRecordType('__proto__')).toBe(false);
	});
});
