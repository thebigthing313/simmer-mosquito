/** @vitest-environment jsdom */

/**
 * Where a refused collection save puts its message.
 *
 * A collection has six command shapes, and the form used to check four of their
 * rules a second time in `onSubmit`, throwing a bare string into the page alert
 * before the domain builder's attributed message could be read. Only the builder
 * runs now.
 *
 * `startedAt` is the entry worth knowing about: the two set commands take it
 * directly rather than inside a timing, so the issue arrives under a second path
 * and the field map carries both. Without that entry a trap still in the field
 * with no set date reported into the page alert, which is this bug arriving by
 * the other route.
 */

import { describe, expect, it } from 'vitest';
import {
	type CollectionFormValues,
	noLureValue,
	noUnitValue,
	validateCollection,
} from '../../../../../routes/adult-surveillance/collections/-collection-form';

const POINT = { type: 'Point', coordinates: [-118.24, 34.05] } as const;
const TRAP = '44444444-4444-4444-8444-444444444444';
const METHOD = '55555555-5555-4555-8555-555555555555';

function values(overrides: Partial<CollectionFormValues> = {}): CollectionFormValues {
	return {
		sourceMode: 'trap',
		trapId: TRAP,
		addressId: null,
		collectionMethodId: METHOD,
		collectionLureId: noLureValue,
		timingMode: 'exact_timestamps',
		startedAt: '2026-08-10',
		collectedAt: '2026-08-12',
		collectionDate: null,
		durationAmount: null,
		durationUnitId: noUnitValue,
		setByProfileId: null,
		collectedByProfileId: null,
		additionalPersonnelIds: [],
		hasProblem: false,
		metadata: null,
		comment: '',
		...overrides,
	};
}

describe('a collection the domain refuses', () => {
	it('passes a collected trap collection', () => {
		expect(validateCollection(values(), null)).toBeUndefined();
	});

	it('names the trap on the trap field', () => {
		const result = validateCollection(values({ trapId: null }), null);

		expect(result?.fields?.trapId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	// Still out in the field: legal, but only if the record says when it was set.
	it('names a missing set date on the set-date field', () => {
		const result = validateCollection(values({ collectedAt: null, startedAt: null }), null);

		expect(result?.fields?.startedAt).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names a missing collection date on the collection-date field', () => {
		const result = validateCollection(
			values({
				timingMode: 'collection_date_duration',
				collectedAt: null,
				collectionDate: null,
				durationAmount: 24,
				durationUnitId: METHOD,
			}),
			null,
		);

		expect(result?.fields?.collectionDate).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the method on the method field of a one-off collection', () => {
		const result = validateCollection(
			values({ sourceMode: 'adhoc', trapId: null, collectionMethodId: '' }),
			POINT,
		);

		expect(result?.fields?.collectionMethodId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});
});
