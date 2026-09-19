import { useNavigate, useSearch } from '@tanstack/react-router';
import {
	countActiveFilters,
	type FilterCodecs,
	type FilterCounting,
	filterKeys,
	resolveFilters,
	type SearchFilters,
} from '../lib/search-filters';
/**
 * Binds a filter set to the current route's search params. A filter change
 * replaces the history entry rather than pushing one.
 *
 * `defaults`, `codecs` and `counting` must be stable across renders: module
 * constants, or memoised where a default is derived, such as today's date.
 */
export function useSearchFilters<TFilters extends object>(
	defaults: TFilters,
	codecs: FilterCodecs<TFilters>,
	counting?: FilterCounting<TFilters>,
): SearchFilters<TFilters> {
	const search = useSearch({ strict: false }) as Record<string, unknown>;
	const navigate = useNavigate();

	const filters = resolveFilters(defaults, codecs, search);

	const setFilters = (patch: Partial<TFilters>) => {
		navigate({
			replace: true,
			search: (previous: Record<string, unknown>) => {
				const result: Record<string, unknown> = { ...previous };
				for (const key of filterKeys(patch)) {
					const value = patch[key];
					if (value === undefined) {
						continue;
					}
					const encoded = codecs[key].encode(value);
					if (encoded === undefined) {
						delete result[key];
					} else {
						result[key] = encoded;
					}
				}
				return result;
			},
			// This navigates within whatever route mounted the hook, which the
			// router's typed `to` cannot express from a shared helper.
		} as never);
	};

	const reset = () => {
		navigate({
			replace: true,
			search: (previous: Record<string, unknown>) => {
				const result: Record<string, unknown> = { ...previous };
				for (const key of filterKeys(defaults)) {
					delete result[key];
				}
				return result;
			},
		} as never);
	};

	const activeCount = countActiveFilters(defaults, filters, counting);

	return { filters, setFilters, reset, activeCount };
}
