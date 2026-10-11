/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearchPicker } from '../../../../hooks/pickers/use-search-picker';

afterEach(cleanup);

/**
 * What a search-and-pick field says while it is closed, held in one place
 * (#1434). Every picker used to keep its own picked label beside `value`, and
 * the label went stale two ways: a list that arrived after mount never filled
 * the field, and a `value` changed from outside went on showing the record
 * picked before it.
 *
 * A caller binding a pick calls `pick` and sets `value` in the same event, so
 * the two land in one render. `bindPick` is that event.
 */

const FIRST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MILL_POND = 'MP-1 - Mill Pond';

interface Props {
	readonly value: string | null;
	readonly resolvedLabel: string;
}

function picker(initial: Props, onClear: () => void = () => undefined) {
	const rendered = renderHook((props: Props) => useSearchPicker({ ...props, onClear }), {
		initialProps: initial,
	});
	/** A row's `onSelect` on a bound field: the pick and the new value, in one render. */
	const bindPick = (id: string, label: string, resolvedLabel: string) =>
		act(() => {
			rendered.result.current.pick(id, label);
			rendered.rerender({ value: id, resolvedLabel });
		});
	return { ...rendered, bindPick };
}

describe('useSearchPicker', () => {
	it('shows the picked label and closes the popover on a pick', () => {
		const { result, bindPick } = picker({ value: null, resolvedLabel: '' });

		act(() => result.current.frame.onOpen());
		expect(result.current.frame.open).toBe(true);

		// The caller's resolution has not caught up yet, which is the case the
		// picked label exists for.
		bindPick(FIRST, MILL_POND, '');

		expect(result.current.frame.open).toBe(false);
		expect(result.current.frame.selectedLabel).toBe(MILL_POND);
	});

	it('empties the label and the search and calls onClear on a clear', () => {
		const onClear = vi.fn();
		const { result, rerender, bindPick } = picker({ value: null, resolvedLabel: '' }, onClear);

		bindPick(FIRST, MILL_POND, MILL_POND);
		act(() => {
			result.current.frame.onClear();
			rerender({ value: null, resolvedLabel: '' });
		});

		expect(onClear).toHaveBeenCalledTimes(1);
		expect(result.current.frame.selectedLabel).toBe('');
		expect(result.current.frame.search).toBe('');
		expect(result.current.search).toBe('');
	});

	it('starts from the picked label when reopened after a pick', () => {
		const { result, bindPick } = picker({ value: null, resolvedLabel: '' });

		bindPick(FIRST, MILL_POND, MILL_POND);
		act(() => result.current.frame.onOpen());

		expect(result.current.frame.open).toBe(true);
		expect(result.current.frame.search).toBe(MILL_POND);
	});

	it('empties the label and the search when value goes to null from outside', () => {
		const { result, rerender, bindPick } = picker({ value: null, resolvedLabel: '' });

		bindPick(FIRST, MILL_POND, MILL_POND);
		rerender({ value: null, resolvedLabel: '' });

		expect(result.current.frame.selectedLabel).toBe('');
		expect(result.current.search).toBe('');
	});

	it('shows the resolved label of another id set from outside, not the old pick', () => {
		const { result, rerender, bindPick } = picker({ value: null, resolvedLabel: '' });

		bindPick(FIRST, MILL_POND, MILL_POND);
		rerender({ value: SECOND, resolvedLabel: 'CS-7 - Cedar Slough' });

		expect(result.current.frame.selectedLabel).toBe('CS-7 - Cedar Slough');
		expect(result.current.search).toBe('');
	});

	it('shows a resolved label that arrives after mount', () => {
		const { result, rerender } = picker({ value: FIRST, resolvedLabel: '' });
		expect(result.current.frame.selectedLabel).toBe('');

		rerender({ value: FIRST, resolvedLabel: MILL_POND });

		expect(result.current.frame.selectedLabel).toBe(MILL_POND);
	});

	// The route editor's add-stop field picks without binding: the stop is
	// added and `value` stays null, so the next search starts empty.
	it('drops a pick the caller does not bind', () => {
		const { result } = picker({ value: null, resolvedLabel: '' });

		act(() => result.current.pick(FIRST, MILL_POND));
		act(() => result.current.frame.onOpen());

		expect(result.current.frame.selectedLabel).toBe('');
		expect(result.current.frame.search).toBe('');
	});

	it('opens on typing and holds the text', () => {
		const { result } = picker({ value: null, resolvedLabel: '' });

		act(() => result.current.frame.onSearchChange('mill'));

		expect(result.current.frame.open).toBe(true);
		expect(result.current.search).toBe('mill');
	});
});
