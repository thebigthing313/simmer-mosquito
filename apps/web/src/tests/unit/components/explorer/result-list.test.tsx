/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultList } from '../../../../components/explorer/result-list';

// The rows arrive inside a Radix ScrollArea, which measures itself on mount.
// jsdom has no ResizeObserver, and a list that never reports a size is still a
// list: the assertions here are about what it says, not how tall it is.
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

afterEach(cleanup);

const ROWS = [{ id: 'a', name: 'Culvert 12' }] as const;
type Row = (typeof ROWS)[number];

function renderList(props: {
	rows: readonly Row[];
	isError?: boolean;
	onRetry?: () => void;
	isLoading?: boolean;
}) {
	return render(
		<ResultList
			emptyDescription="Loosen the filters to bring habitats into range."
			emptyTitle="No habitats in view"
			isEmpty={props.rows.length === 0}
			isError={props.isError ?? false}
			isLoading={props.isLoading ?? false}
			onRetry={props.onRetry}
		>
			<ul>
				{props.rows.map((row) => (
					<li key={row.id}>{row.name}</li>
				))}
			</ul>
		</ResultList>,
	);
}

/**
 * The failure state exists because the empty state was standing in for it: a
 * request that 500'd reached the rail as zero rows, and the reader was told to
 * loosen filters that were never the problem.
 */
describe('ResultList', () => {
	it('says the request failed rather than that nothing matched', () => {
		renderList({ rows: [], isError: true });

		expect(screen.getByRole('alert').textContent).toContain('Could not load results');
		expect(screen.queryByText('No habitats in view')).toBeNull();
	});

	it('offers a retry that runs the request again', () => {
		const onRetry = vi.fn();
		renderList({ rows: [], isError: true, onRetry });

		fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('keeps the rows and says they are stale when a refetch fails behind them', () => {
		renderList({ rows: ROWS, isError: true });

		expect(screen.getByText('Culvert 12')).toBeTruthy();
		expect(screen.getByRole('alert').textContent).toContain('Showing the last result');
	});

	it('still explains an ordinary empty result', () => {
		renderList({ rows: [] });

		expect(screen.getByText('No habitats in view')).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
