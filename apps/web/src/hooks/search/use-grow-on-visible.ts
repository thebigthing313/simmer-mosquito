import { type RefObject, useEffect, useRef } from 'react';

/** Calls `grow` whenever the returned sentinel scrolls into view and `armed` is true. */
export function useGrowOnVisible(
	armed: boolean,
	grow: () => void,
): RefObject<HTMLDivElement | null> {
	const sentinel = useRef<HTMLDivElement>(null);

	// The call site passes an arrow that only calls a state setter, so the closure
	// the observer holds cannot go stale in a way that is read. A reason that
	// wraps onto a second line stops suppressing, so it stays on the ignore.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `grow` is a fresh closure every render and re-observing on it would loop
	useEffect(() => {
		const node = sentinel.current;
		if (node === null || !armed) {
			return;
		}

		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				grow();
			}
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [armed]);

	return sentinel;
}
