import { describe, expect, it } from 'vitest';
import {
	catalogRecordTypes,
	deletableRecordLabel,
	deletableRecordTypes,
	deleteReferenceScopes,
	isDeletableRecordType,
} from '../../../index.js';

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
	'notificationRegistration',
	'outreachAction',
	'region',
	'regionFolder',
	'requestedControlAction',
	'route',
	'sample',
	'serviceRequest',
	'sourceReduction',
	'trap',
	// Catalogs, block-only.
	'applicationMethod',
	'biocontrolMethod',
	'collectionLure',
	'collectionMethod',
	'equipment',
	'formulation',
	'habitatType',
	'insecticide',
	'insecticideBatch',
	'notificationType',
	'outreachMethod',
	'sourceReductionMethod',
	'tag',
	'vehicle',
];

/**
 * The catalogs, which carry a rule the operational types do not.
 *
 * A catalog row is deletable only while nothing refers to it, so every one of
 * its rules blocks. A cascade or a detach here would mean a delete rewriting
 * records that name the row, which is what Deactivate exists to avoid.
 *
 * Read from `catalogRecordTypes()` rather than restated: the gate and the
 * registry share that list, and a second copy here could disagree with it while
 * both stayed green.
 */
const CATALOG_TYPES = catalogRecordTypes();

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

	it('blocks and only blocks on every catalog', () => {
		for (const recordType of CATALOG_TYPES) {
			const scopes = deleteReferenceScopes(recordType);
			expect(scopes.length).toBeGreaterThan(0);
			for (const scope of scopes) {
				expect(scope.effect).toBe('block');
				// A catalog is never a comment, tag, or personnel target, so a
				// polymorphic scope here would be pointing at a support table that
				// cannot name it.
				expect(scope.scope.kind).toBe('direct');
			}
		}
	});

	it('rejects a record type it does not know', () => {
		expect(isDeletableRecordType('habitat')).toBe(true);
		expect(isDeletableRecordType('weatherStation')).toBe(false);
		expect(isDeletableRecordType('__proto__')).toBe(false);
	});
});
