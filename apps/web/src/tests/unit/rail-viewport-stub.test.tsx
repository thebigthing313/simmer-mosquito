/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ResultRows } from '../../components/explorer/result-list';
import { STUB_ROW_HEIGHT, stubRailViewportHeight } from './rail-viewport-stub';
import { stubPanelLayout } from './routes/explorer-route-harness';

// Radix's ScrollArea constructs a ResizeObserver on mount and jsdom has none.
// The stub is about height and leaves the observer to the suite, so this is the
// same no-op `result-list.test.tsx` installs.
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

afterEach(cleanup);

const ROWS = Array.from({ length: 8 }, (_, index) => ({ id: `row-${index}` }));

function renderRail() {
	return render(
		<ResultRows rows={ROWS}>{(row) => <span data-testid="row">{row.id}</span>}</ResultRows>,
	);
}

function mountedRows(): readonly (string | null)[] {
	return screen.queryAllByTestId('row').map((row) => row.textContent);
}

/**
 * Both halves of each case run under the same document, so what the stub
 * lifts is measured rather than assumed, and the third render proves the
 * restore: a stub that leaked past it would read eight there.
 *
 * The two describes are two environments and their order is load-bearing.
 * `stubPanelLayout` redefines `offsetHeight` for the rest of the file and
 * nothing puts it back, so the plain-jsdom cases run first.
 */
describe('stubRailViewportHeight under plain jsdom', () => {
	// A zero-height viewport mounts nothing: the virtualiser's range is null
	// while the outer size is zero, so the seven the nearby cases met is not
	// this environment's.
	it('mounts every row of a list the height holds, and none without it', () => {
		renderRail();
		expect(mountedRows()).toEqual([]);
		cleanup();

		const restore = stubRailViewportHeight(ROWS.length * STUB_ROW_HEIGHT);
		try {
			renderRail();
			expect(mountedRows()).toEqual(ROWS.map((row) => row.id));
		} finally {
			restore();
		}
		cleanup();

		renderRail();
		expect(mountedRows()).toEqual([]);
	});

	it('leaves an element outside the rail measuring as it did', () => {
		const restore = stubRailViewportHeight(480);
		try {
			const { container } = render(<div />);
			expect((container.firstElementChild as HTMLElement).offsetHeight).toBe(0);
		} finally {
			restore();
		}
	});
});

describe('stubRailViewportHeight over stubPanelLayout', () => {
	beforeAll(stubPanelLayout);

	// One size for every element is a 700px viewport over 700px rows, which
	// holds one row, and six of overscan make seven. This is the limit the
	// nearby link-destinations cases rendered one kind per case to stay under.
	it('lifts the seven-row limit and puts it back', () => {
		renderRail();
		expect(mountedRows()).toHaveLength(7);
		cleanup();

		const restore = stubRailViewportHeight(ROWS.length * STUB_ROW_HEIGHT);
		try {
			renderRail();
			expect(mountedRows()).toEqual(ROWS.map((row) => row.id));
		} finally {
			restore();
		}
		cleanup();

		renderRail();
		expect(mountedRows()).toHaveLength(7);
	});

	it('leaves the panel stub answering for everything else', () => {
		const restore = stubRailViewportHeight(480);
		try {
			const { container } = render(<div />);
			expect((container.firstElementChild as HTMLElement).offsetHeight).toBe(700);
		} finally {
			restore();
		}
	});
});
