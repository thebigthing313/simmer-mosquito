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
	const [draft, setDraft] = useState(urlQuery);
	useEffect(() => setDraft(urlQuery), [urlQuery]);
	const { debounced: typed } = useDebouncedValue(draft, SEARCH_QUERY_DEBOUNCE_MS);

	useEffect(() => {
		if (typed !== urlQuery) {
			navigate({ to: '/search', search: (previous) => ({ ...previous, q: typed }), replace: true });
		}
	}, [typed, urlQuery, navigate]);

	return [draft, setDraft];
}
