import { useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, read from `matchMedia` on every change. The
 * query is the subscription, so `useSyncExternalStore` is the shape, the same
 * one `useIsMobile` takes for its single breakpoint. Without a window it
 * answers `false`.
 */
export function useMediaQuery(query: string): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const list = window.matchMedia(query);
			list.addEventListener('change', onChange);
			return () => list.removeEventListener('change', onChange);
		},
		() => window.matchMedia(query).matches,
		() => false,
	);
}
