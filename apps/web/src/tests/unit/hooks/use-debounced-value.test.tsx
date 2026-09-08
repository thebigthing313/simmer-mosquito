/** @vitest-environment jsdom */
import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from '../../../hooks/use-debounced-value';

/**
 * Clearing a debounced search box has to reach the query, not only the input.
 *
 * The add-stop picker in the route editor is the shape this covers: a box whose
 * text is debounced into a lookup that keeps its previous rows while the next
 * request is in flight. Clearing by emptying the input alone leaves the queued
 * settle in place, so the panel underneath goes on listing matches for text that
 * is no longer on screen until the window elapses.
 */

const DELAY_MS = 220;

function AddStopHarness({ onQuery }: { readonly onQuery: (query: string) => void }) {
	const [input, setInput] = useState('');
	const { debounced, settle } = useDebouncedValue(input, DELAY_MS);

	onQuery(debounced);

	return (
		<SearchInput
			label="Search habitats to add"
			onChange={(event) => setInput(event.target.value)}
			onClear={() => {
				setInput('');
				settle('');
			}}
			placeholder="Search habitats to add a stop…"
			value={input}
		/>
	);
}

describe('useDebouncedValue', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		cleanup();
	});

	it('clears the query in the same frame it clears the input', () => {
		const queries: string[] = [];
		render(<AddStopHarness onQuery={(query) => queries.push(query)} />);

		const box = screen.getByRole('searchbox', { name: 'Search habitats to add' });
		act(() => {
			fireEvent.change(box, { target: { value: 'pond' } });
		});
		act(() => vi.advanceTimersByTime(DELAY_MS));
		expect(queries.at(-1)).toBe('pond');

		act(() => {
			fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
		});

		// No timer advance: the point is that the query is already empty, rather
		// than empty once the window nobody cancelled has run out.
		expect(queries.at(-1)).toBe('');
	});

	it('holds a keystroke back until the typing pauses', () => {
		const queries: string[] = [];
		render(<AddStopHarness onQuery={(query) => queries.push(query)} />);

		const box = screen.getByRole('searchbox', { name: 'Search habitats to add' });
		act(() => {
			fireEvent.change(box, { target: { value: 'po' } });
		});
		act(() => vi.advanceTimersByTime(DELAY_MS - 1));
		expect(queries.at(-1)).toBe('');

		act(() => vi.advanceTimersByTime(1));
		expect(queries.at(-1)).toBe('po');
	});

	it('offers no clear control until there is something to clear', () => {
		render(<AddStopHarness onQuery={() => {}} />);

		expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();

		act(() => {
			fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'p' } });
		});
		expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeNull();
	});
});
