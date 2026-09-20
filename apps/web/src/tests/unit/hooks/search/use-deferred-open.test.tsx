/** @vitest-environment jsdom */
import type { SearchResult } from '@simmer-mosquito/domain';
import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DestinationResolution } from '../../../../components/search/search-destinations';
import { useDeferredOpen } from '../../../../hooks/search/use-deferred-open';

const ROUTE_ID = '00000000-0000-4000-8000-00000000trap';

const COMMENT: SearchResult = {
	kind: 'comment',
	id: `comment-${ROUTE_ID}`,
	title: 'Gate is locked before 7am',
	targetType: 'route',
	targetId: ROUTE_ID,
	matchedField: 'body',
	matchClass: 'text',
};

/**
 * The wait ends in the render that sees the answer, not one later. Each
 * committed render is recorded with the value the hook returned, from a layout
 * effect so a render React throws away before commit is not in the list, and a
 * frame drawing the row as pending against an answer that already exists would
 * be in it.
 */
function renderDeferred(initial: DestinationResolution<string>) {
	const open = vi.fn<(destination: string) => void>();
	const frames: (string | undefined)[] = [];
	let resolution = initial;
	const rendered = renderHook(() => {
		const deferred = useDeferredOpen(() => resolution, open);
		const { waitingValue } = deferred;
		useLayoutEffect(() => {
			frames.push(waitingValue);
		});
		return deferred;
	});
	return {
		...rendered,
		open,
		frames,
		answer(next: DestinationResolution<string>) {
			resolution = next;
			rendered.rerender();
		},
	};
}

describe('a result whose destination is pending', () => {
	it('is held as waiting, then opened once the lookup answers', () => {
		const deferred = renderDeferred({ status: 'pending' });
		act(() => deferred.result.current.select(COMMENT));
		expect(deferred.result.current.waitingValue).toBe(`comment:${COMMENT.id}`);
		expect(deferred.open).not.toHaveBeenCalled();

		act(() => deferred.answer({ status: 'ready', destination: '/routes/trap' }));
		expect(deferred.open).toHaveBeenCalledExactlyOnceWith('/routes/trap');
		expect(deferred.result.current.waitingValue).toBeUndefined();
	});

	it('never commits a frame that is still waiting on an answer it has', () => {
		const deferred = renderDeferred({ status: 'pending' });
		act(() => deferred.result.current.select(COMMENT));
		deferred.frames.length = 0;

		act(() => deferred.answer({ status: 'ready', destination: '/routes/trap' }));
		// The render that read the answer is thrown away before it commits, so
		// what reaches the screen is the cleared wait and nothing before it.
		expect(deferred.frames).toEqual([undefined]);
	});

	it('opens the answer once, not on every later render', () => {
		const deferred = renderDeferred({ status: 'pending' });
		act(() => deferred.result.current.select(COMMENT));
		act(() => deferred.answer({ status: 'ready', destination: '/routes/trap' }));
		act(() => deferred.rerender());
		act(() => deferred.rerender());
		expect(deferred.open).toHaveBeenCalledTimes(1);
	});

	it('clears the wait without opening when the lookup answers nothing', () => {
		const deferred = renderDeferred({ status: 'pending' });
		act(() => deferred.result.current.select(COMMENT));
		act(() => deferred.answer({ status: 'unresolved' }));
		expect(deferred.open).not.toHaveBeenCalled();
		expect(deferred.result.current.waitingValue).toBeUndefined();
	});

	it('is dropped by cancel before the lookup answers', () => {
		const deferred = renderDeferred({ status: 'pending' });
		act(() => deferred.result.current.select(COMMENT));
		act(() => deferred.result.current.cancel());
		act(() => deferred.answer({ status: 'ready', destination: '/routes/trap' }));
		expect(deferred.open).not.toHaveBeenCalled();
	});
});

describe('a result that resolves at once', () => {
	it('opens from the select and holds nothing', () => {
		const deferred = renderDeferred({ status: 'ready', destination: '/routes/trap' });
		act(() => deferred.result.current.select(COMMENT));
		expect(deferred.open).toHaveBeenCalledExactlyOnceWith('/routes/trap');
		expect(deferred.result.current.waitingValue).toBeUndefined();
	});
});
