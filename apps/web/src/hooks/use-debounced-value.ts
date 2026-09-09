import { useEffect, useRef, useState } from 'react';

/**
 * A value held back until the typing stops, with a way to land one at once.
 *
 * This was written twice, generically in the route planner's add-stop picker and
 * over a string in the global search palette, as the same five lines. Neither
 * copy could cancel, and that is what clearing a search box needs: emptying the
 * input schedules another settle rather than dropping the one already queued, so
 * for the rest of the window the list underneath still answers the text that has
 * gone from the screen.
 *
 * `settle` is the answer. It drops the pending timer and publishes the value
 * given, so a clear reaches the query in the same frame it reaches the input.
 *
 * The URL-backed list filters use `useDebouncedTextFilter` in `lib/search-filters`
 * instead. That one owns the input as well, because its committed value is a
 * navigation.
 */
export function useDebouncedValue<T>(
	value: T,
	delayMs: number,
): {
	/** The value as it stands after the last pause, or the last `settle`. */
	readonly debounced: T;
	/** Publish `next` now and drop whatever was queued. */
	readonly settle: (next: T) => void;
} {
	const [debounced, setDebounced] = useState(value);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => {
		timer.current = window.setTimeout(() => setDebounced(value), delayMs);
		return () => window.clearTimeout(timer.current);
	}, [value, delayMs]);

	const settle = (next: T) => {
		window.clearTimeout(timer.current);
		setDebounced(next);
	};

	return { debounced, settle };
}
