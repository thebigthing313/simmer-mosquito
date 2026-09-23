import { type RefObject, useEffect, useEffectEvent, useRef } from 'react';

/** Calls `grow` whenever the returned sentinel scrolls into view and `armed` is true. */
export function useGrowOnVisible(
	armed: boolean,
	grow: () => void,
): RefObject<HTMLDivElement | null> {
	const sentinel = useRef<HTMLDivElement>(null);

	// `grow` is a fresh closure every render and re-observing on it would loop,
	// so the observer calls it through an effect event and the effect re-runs
	// on `armed` alone.
	const onVisible = useEffectEvent(() => {
		grow();
	});

	useEffect(() => {
		const node = sentinel.current;
		if (node === null || !armed) {
			return;
		}

		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				onVisible();
			}
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [armed]);

	return sentinel;
}
