import { describe, expect, it } from 'vitest';
import { deletableRecordLabel, deletableRecordTypes, isDeletableRecordType } from './index.js';

/**
 * The record types the delete-impact endpoint accepts.
 *
 * `apps/web` restates the subset it has detail pages for in
 * `hooks/use-delete-impact.ts` — the browser bundle does not depend on this
 * package. Pinning the full list here means adding a deletable record fails
 * this test, which is the prompt to decide whether the client needs it too.
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
	it('covers exactly the record types the client knows about', () => {
		expect([...deletableRecordTypes()].sort()).toEqual([...EXPECTED_TYPES].sort());
	});

	it('names every record in domain language', () => {
		for (const recordType of deletableRecordTypes()) {
			expect(deletableRecordLabel(recordType).trim()).not.toBe('');
		}
	});

	it('rejects a record type it does not know', () => {
		expect(isDeletableRecordType('habitat')).toBe(true);
		expect(isDeletableRecordType('weatherStation')).toBe(false);
		expect(isDeletableRecordType('__proto__')).toBe(false);
	});
});
