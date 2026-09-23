import type { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../use-debounced-value';
import { SEARCH_QUERY_DEBOUNCE_MS } from './use-global-search';

/**
 * The search field's draft and the URL's `q`, kept in step through the
 * debounce. The navigation replaces rather than pushes.
 */
export function useEditableQuery(
	urlQuery: string,
	navigate: ReturnType<typeof useNavigate>,
): [string, (value: string) => void] {
	// The draft is held beside the URL query it was typed against. A URL query
	// the draft was not typed against is a fresh one, and the draft is that
	// query until the reader types, which is the reset an effect used to make
	// one render late.
	const [held, setHeld] = useState({ urlQuery, draft: urlQuery });
	const draft = held.urlQuery === urlQuery ? held.draft : urlQuery;
	const setDraft = (value: string) => setHeld({ urlQuery, draft: value });
	const { debounced: typed } = useDebouncedValue(draft, SEARCH_QUERY_DEBOUNCE_MS);

	useEffect(() => {
		if (typed !== urlQuery) {
			navigate({ to: '/search', search: (previous) => ({ ...previous, q: typed }), replace: true });
		}
	}, [typed, urlQuery, navigate]);

	return [draft, setDraft];
}
