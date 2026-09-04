/**
 * The three values every mutation hook mints for itself.
 *
 * `optimisticStamp` and `lifecycleStamp` are both "now" and are not
 * interchangeable. An `updated_at` built from the first is stripped out of the
 * outgoing body and only ever dresses the row on screen. A `started_at` built
 * from the second is sent, and the server checks that moment against its own
 * clock with no tolerance, so a browser running two seconds fast had every one
 * of these refused as in the future (#37). The backdating is what stands between
 * those two facts, and nothing else in this app asserts it: a hook that reached
 * for the wrong one reads correctly and fails only on somebody else's machine.
 *
 * The clock is frozen for these, so the margin is an equality rather than a
 * range that would still pass if the backdating went the wrong way.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lifecycleStamp, newRecordId, optimisticStamp } from '../../../../hooks/mutations/shared';

/** The margin `shared.ts` backdates by, restated so a change to it fails here. */
const SKEW_MARGIN_MS = 2_000;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-08-03T17:45:00.000Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('an optimistic stamp', () => {
	it('is the moment it was taken, with nothing subtracted', () => {
		expect(optimisticStamp().getTime()).toBe(Date.now());
	});
});

describe('a lifecycle stamp', () => {
	it('is behind the optimistic stamp by the skew margin', () => {
		expect(optimisticStamp().getTime() - lifecycleStamp().getTime()).toBe(SKEW_MARGIN_MS);
	});

	it('lands in the past, which is the direction the server refuses on', () => {
		expect(lifecycleStamp().getTime()).toBeLessThan(Date.now());
	});
});

describe('a new record id', () => {
	it('is different every call, because a create mints its own key', () => {
		expect(newRecordId()).not.toBe(newRecordId());
	});

	it('is a uuid, because the column it lands in is one', () => {
		expect(newRecordId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	});
});
