/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useStopOrder } from '../../../../hooks/stop-order/use-stop-order';

/**
 * The optimistic overlay over a reorderable stop list: a move shows its order
 * at once, the overlay is dropped in the render that sees sync agree with it,
 * and a dropped overlay never re-sorts the next order sync sends. The drop was
 * an effect until #1181's fourth child, one render late.
 */

interface Stop {
	readonly id: string;
}

const A: Stop = { id: 'a' };
const B: Stop = { id: 'b' };
const C: Stop = { id: 'c' };

function renderOrder(initial: readonly Stop[]) {
	const commit = vi.fn<(plan: unknown) => Promise<void>>(() => Promise.resolve());
	const rendered = renderHook(
		({ items }: { readonly items: readonly Stop[] }) =>
			useStopOrder({ items, keyOf: (stop) => stop.id, commit }),
		{ initialProps: { items: initial } },
	);
	return { ...rendered, commit };
}

function ids(stops: readonly Stop[]): string[] {
	return stops.map((stop) => stop.id);
}

describe('the stop order overlay', () => {
	it('shows the moved order at once and sends the plan', async () => {
		const order = renderOrder([A, B, C]);
		await act(() => order.result.current.move(2, 'up'));
		expect(ids(order.result.current.ordered)).toEqual(['a', 'c', 'b']);
		expect(order.commit).toHaveBeenCalledOnce();
	});

	it('is dropped once sync agrees, and leaves a later synced order alone', async () => {
		const order = renderOrder([A, B, C]);
		await act(() => order.result.current.move(2, 'up'));

		order.rerender({ items: [A, C, B] });
		expect(ids(order.result.current.ordered)).toEqual(['a', 'c', 'b']);

		// Another device moves a stop. A stale overlay would sort this back.
		order.rerender({ items: [C, A, B] });
		expect(ids(order.result.current.ordered)).toEqual(['c', 'a', 'b']);
	});

	it('rolls back and rethrows when the move is refused', async () => {
		const order = renderOrder([A, B, C]);
		order.commit.mockRejectedValueOnce(new Error('refused'));
		await expect(act(() => order.result.current.move(2, 'up'))).rejects.toThrow('refused');
		expect(ids(order.result.current.ordered)).toEqual(['a', 'b', 'c']);
	});
});
