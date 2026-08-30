import { describe, expect, it } from 'vitest';
import { resolveRecordSeed } from '../../../forms/record-seed';

/**
 * The seam between two rules that are each right on their own.
 *
 * Search returns a retired record, because somebody looking one up wants to read
 * its history. A create form's picker offers active records only, because a
 * retired site is not new work. Seeding a create form from a retired record put
 * a value in a field the picker beside it would not offer back, and nothing
 * pinned either half.
 *
 * `useRecordSeed` is the live query around this; the rule is here, where a test
 * can state a lifecycle without a collection.
 */
const SEED_ID = '11111111-1111-4111-8111-111111111111';

describe('a create form seeded from a record', () => {
	it('keeps the id of an active record', () => {
		expect(
			resolveRecordSeed({ id: SEED_ID, isReady: true, isError: false, isActive: true }),
		).toEqual({ status: 'ready', id: SEED_ID });
	});

	it('drops the id of a retired record, so the form opens blank', () => {
		expect(
			resolveRecordSeed({ id: SEED_ID, isReady: true, isError: false, isActive: false }),
		).toEqual({ status: 'ready', id: null });
	});

	// A row this agency cannot see reads the same as a retired one. Seeding it
	// would name a record no picker can show and no save can resolve.
	it('drops an id no row answers to', () => {
		expect(
			resolveRecordSeed({ id: SEED_ID, isReady: true, isError: false, isActive: undefined }),
		).toEqual({ status: 'ready', id: null });
	});

	// Form defaults are taken once at mount, so answering early would decide the
	// lifecycle from an empty collection and blank every seeded form on a cold
	// load.
	it('waits while the record is still loading', () => {
		expect(
			resolveRecordSeed({ id: SEED_ID, isReady: false, isError: false, isActive: undefined }),
		).toEqual({ status: 'pending' });
	});

	// A failed read cannot vouch for the record, and the picker beside the field
	// is failing on the same collection.
	it('opens blank rather than waiting on a read that failed', () => {
		expect(
			resolveRecordSeed({ id: SEED_ID, isReady: false, isError: true, isActive: undefined }),
		).toEqual({ status: 'ready', id: null });
	});
});

describe('a create form opened with no seed', () => {
	// The common case: nothing to read, so nothing to wait for. A `pending` here
	// would put a skeleton in front of every plain "Record Inspection".
	it('is ready without a read', () => {
		expect(
			resolveRecordSeed({ id: null, isReady: false, isError: false, isActive: undefined }),
		).toEqual({ status: 'ready', id: null });
	});
});
