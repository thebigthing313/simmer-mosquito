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
 */

const FIRST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface Props {
	readonly value: string | null;
	readonly resolvedLabel: string;
}

function picker(initial: Props, onClear: () => void = () => undefined) {
	return renderHook((props: Props) => useSearchPicker({ ...props, onClear }), {
		initialProps: initial,
	});
}

describe('useSearchPicker', () => {
	it('shows the picked label and closes the popover on a pick', () => {
		const { result, rerender } = picker({ value: null, resolvedLabel: '' });

		act(() => result.current.frame.onOpen());
		expect(result.current.frame.open).toBe(true);

		act(() => result.current.pick(FIRST, 'MP-1 - Mill Pond'));
		// The caller's resolution has not caught up yet, which is the case the
		// picked label exists for.
		rerender({ value: FIRST, resolvedLabel: '' });

		expect(result.current.frame.open).toBe(false);
		expect(result.current.frame.selectedLabel).toBe('MP-1 - Mill Pond');
	});

	it('empties the label and the search and calls onClear on a clear', () => {
		const onClear = vi.fn();
		const { result, rerender } = picker({ value: null, resolvedLabel: '' }, onClear);

		act(() => result.current.pick(FIRST, 'MP-1 - Mill Pond'));
		rerender({ value: FIRST, resolvedLabel: 'MP-1 - Mill Pond' });

		act(() => result.current.frame.onClear());
		rerender({ value: null, resolvedLabel: '' });

		expect(onClear).toHaveBeenCalledTimes(1);
		expect(result.current.frame.selectedLabel).toBe('');
		expect(result.current.frame.search).toBe('');
		expect(result.current.search).toBe('');
	});

	it('starts from the picked label when reopened after a pick', () => {
		const { result, rerender } = picker({ value: null, resolvedLabel: '' });

		act(() => result.current.pick(FIRST, 'MP-1 - Mill Pond'));
		rerender({ value: FIRST, resolvedLabel: 'MP-1 - Mill Pond' });
		act(() => result.current.frame.onOpen());

		expect(result.current.frame.open).toBe(true);
		expect(result.current.frame.search).toBe('MP-1 - Mill Pond');
	});

	it('empties the label and the search when value goes to null from outside', () => {
		const { result, rerender } = picker({ value: null, resolvedLabel: '' });

		act(() => result.current.pick(FIRST, 'MP-1 - Mill Pond'));
		rerender({ value: FIRST, resolvedLabel: 'MP-1 - Mill Pond' });
		rerender({ value: null, resolvedLabel: '' });

		expect(result.current.frame.selectedLabel).toBe('');
		expect(result.current.search).toBe('');
	});

	it('shows the resolved label of another id set from outside, not the old pick', () => {
		const { result, rerender } = picker({ value: null, resolvedLabel: '' });

		act(() => result.current.pick(FIRST, 'MP-1 - Mill Pond'));
		rerender({ value: FIRST, resolvedLabel: 'MP-1 - Mill Pond' });
		rerender({ value: SECOND, resolvedLabel: 'CS-7 - Cedar Slough' });

		expect(result.current.frame.selectedLabel).toBe('CS-7 - Cedar Slough');
		expect(result.current.search).toBe('');
	});

	it('shows a resolved label that arrives after mount', () => {
		const { result, rerender } = picker({ value: FIRST, resolvedLabel: '' });
		expect(result.current.frame.selectedLabel).toBe('');

		rerender({ value: FIRST, resolvedLabel: 'MP-1 - Mill Pond' });

		expect(result.current.frame.selectedLabel).toBe('MP-1 - Mill Pond');
	});

	it('opens on typing and holds the text', () => {
		const { result } = picker({ value: null, resolvedLabel: '' });

		act(() => result.current.frame.onSearchChange('mill'));

		expect(result.current.frame.open).toBe(true);
		expect(result.current.search).toBe('mill');
	});
});
