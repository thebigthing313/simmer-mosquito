import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNoOpUpdate, pickChanged, valuesEqual } from '../../../sync/change-set';

describe('isNoOpUpdate', () => {
	it('recognises a diff that found nothing to send', () => {
		expect(isNoOpUpdate({})).toBe(true);
	});

	it('lets a real change through', () => {
		expect(isNoOpUpdate({ trapName: 'Culex trap 4' })).toBe(false);
	});

	it('counts a field cleared to null as a change', () => {
		// `pickChanged` writes the new value verbatim, so clearing an optional field
		// puts an explicit null in the body — that is a change, not an absence.
		expect(isNoOpUpdate({ addressId: null })).toBe(false);
	});

	it('counts a geometry-only edit as a change', () => {
		// Moving a point leaves every scalar untouched; the body carries just the
		// location, and skipping it would silently discard the move.
		expect(isNoOpUpdate({ locationSource: { kind: 'geometry', geometry: {} } })).toBe(false);
	});
});

describe('pickChanged', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('sends only the keys that changed', () => {
		const body = pickChanged(
			{ id: 'a', trapName: 'Old', description: 'Same' },
			{ id: 'a', trapName: 'New', description: 'Same' },
			['trapName', 'description'],
			'traps.update',
		);

		expect(body).toEqual({ trapName: 'New' });
	});

	it('compares object values by content, not by reference', () => {
		// A form that rebuilds `metadata` on every render produces a new object with
		// the same contents. Two of the seven copies this replaces compared by
		// reference and would have put the untouched object in the body.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const body = pickChanged(
			{ id: 'a', metadata: { depth: 3 } },
			{ id: 'a', metadata: { depth: 3 } },
			['metadata'],
			'habitats.update',
		);

		expect(body).toEqual({});
		expect(warn).not.toHaveBeenCalled();
	});

	it('warns when a change lands on a key the handler cannot send', () => {
		// This is #35 exactly: the trap route page reordered stops by writing
		// `position`, the handler declares `patchKeys: ['directionsToNextItem']`, so
		// nothing was sent and the mutation settled as a success.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const body = pickChanged(
			{ id: 'a', position: 1, directionsToNextItem: null },
			{ id: 'a', position: 4, directionsToNextItem: null },
			['directionsToNextItem'],
			'routeItems.update',
		);

		expect(body).toEqual({});
		expect(isNoOpUpdate(body)).toBe(true);
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0]?.[0])).toContain('routeItems.update');
		expect(String(warn.mock.calls[0]?.[0])).toContain('position');
	});

	it('stays quiet when nothing changed at all', () => {
		// The legitimate empty body: a form opened and closed unchanged, or a save
		// whose real change lives in another table. That must not look like a bug.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const body = pickChanged(
			{ id: 'a', trapName: 'Same', position: 1 },
			{ id: 'a', trapName: 'Same', position: 1 },
			['trapName'],
			'traps.update',
		);

		expect(body).toEqual({});
		expect(warn).not.toHaveBeenCalled();
	});

	it('stays quiet when the change is one the handler sends', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		pickChanged(
			{ id: 'a', trapName: 'Old' },
			{ id: 'a', trapName: 'New' },
			['trapName'],
			'traps.update',
		);

		expect(warn).not.toHaveBeenCalled();
	});

	it('notices a key that only one side has', () => {
		// `original` is partial, so a key present only on `modified` is still a
		// change — and one the handler cannot express here.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		pickChanged(
			{ id: 'a', directionsToNextItem: null },
			{ id: 'a', directionsToNextItem: null, position: 2 },
			['directionsToNextItem'],
			'routeItems.update',
		);

		expect(warn).toHaveBeenCalledOnce();
	});
});

describe('valuesEqual', () => {
	it('treats primitives the way strict equality does', () => {
		expect(valuesEqual('a', 'a')).toBe(true);
		expect(valuesEqual(1, 1)).toBe(true);
		expect(valuesEqual(null, null)).toBe(true);
		expect(valuesEqual('a', 'b')).toBe(false);
		expect(valuesEqual(0, false)).toBe(false);
	});

	it('treats null and undefined as the same absence', () => {
		// Rows carry `null` and mutation drafts sometimes carry `undefined` for the
		// same "no value"; sending a key for that difference would be noise.
		expect(valuesEqual(null, undefined)).toBe(true);
	});

	it('compares objects and arrays by content', () => {
		expect(valuesEqual({ a: 1 }, { a: 1 })).toBe(true);
		expect(valuesEqual({ a: 1 }, { a: 2 })).toBe(false);
		expect(valuesEqual([1, 2], [1, 2])).toBe(true);
		expect(valuesEqual([1, 2], [2, 1])).toBe(false);
	});
});
