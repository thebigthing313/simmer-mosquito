import { useDebouncedTextFilter } from '../use-debounced-text-filter';

/**
 * The address list's search box: the debounced input and the committed term on
 * the URL. `clearSearch` empties both.
 */
export function useAddressSearch(
	urlSearch: string,
	commitSearch: (next: string) => void,
): {
	readonly searchInput: string;
	readonly setSearch: (next: string) => void;
	readonly clearSearch: () => void;
} {
	const { input, setInput, clear } = useDebouncedTextFilter(urlSearch, commitSearch);
	const clearSearch = () => {
		clear();
		commitSearch('');
	};

	return { searchInput: input, setSearch: setInput, clearSearch };
}
