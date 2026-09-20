/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditableQuery } from '../../../../hooks/search/use-editable-query';
import { SEARCH_QUERY_DEBOUNCE_MS } from '../../../../hooks/search/use-global-search';

type Navigate = Parameters<typeof useEditableQuery>[1];

/** Every render's draft, so a frame drawing the old draft against a new URL would be in the list. */
function renderQuery(initialUrlQuery: string) {
	const navigate = vi.fn() as unknown as Navigate;
	const frames: string[] = [];
	const rendered = renderHook(
		({ urlQuery }: { urlQuery: string }) => {
			const editable = useEditableQuery(urlQuery, navigate);
			frames.push(editable[0]);
			return editable;
		},
		{ initialProps: { urlQuery: initialUrlQuery } },
	);
	return { ...rendered, navigate, frames };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('the search field draft', () => {
	it('starts as the URL query and follows typing', () => {
		const query = renderQuery('aedes');
		expect(query.result.current[0]).toBe('aedes');
		act(() => query.result.current[1]('aedes al'));
		expect(query.result.current[0]).toBe('aedes al');
	});

	it('reaches the URL after the debounce, as a replace', () => {
		const query = renderQuery('aedes');
		act(() => query.result.current[1]('culex'));
		expect(query.navigate).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(SEARCH_QUERY_DEBOUNCE_MS));
		expect(query.navigate).toHaveBeenCalledOnce();
		expect(query.navigate).toHaveBeenCalledWith(
			expect.objectContaining({ to: '/search', replace: true }),
		);
	});

	it('is the new URL query in the render that sees it, with no frame in between', () => {
		const query = renderQuery('aedes');
		act(() => query.result.current[1]('aedes al'));
		query.frames.length = 0;

		query.rerender({ urlQuery: 'culex' });
		expect(query.frames).toEqual(['culex']);
	});
});
