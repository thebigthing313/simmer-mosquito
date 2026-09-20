import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void): () => void {
	const mql = window.matchMedia(QUERY);
	mql.addEventListener('change', onChange);
	return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
	return window.matchMedia(QUERY).matches;
}

/** The server has no viewport, and a narrow guess is the one the sidebar hides on. */
function getServerSnapshot(): boolean {
	return false;
}

/**
 * Whether the viewport is under the mobile breakpoint, read from the media
 * query itself. It is a subscription to the window and not state the hook
 * owns, so `useSyncExternalStore` is the shape; the shadcn original seeded a
 * `useState` from an effect, which is one render reading desktop on a phone.
 */
export function useIsMobile(): boolean {
	return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
