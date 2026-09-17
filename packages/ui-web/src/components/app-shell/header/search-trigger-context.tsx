import { createContext, type ReactNode, type RefObject, useContext } from 'react';

/**
 * How the header's search button reaches a palette it cannot import.
 *
 * The palette itself has to live in the mounting app: it reads that app's
 * navigation and its table-to-route map, both of which are typed against that
 * app's route tree, and neither of which this package can see. `AppHeader` takes
 * no props and renders {@link HeaderSearchBar} itself, so the two meet through a
 * context the app provides instead.
 *
 * **With no provider the trigger renders nothing**, and that is the intended
 * behaviour rather than a fallback. `apps/admin` renders the same shell and has
 * been showing a search field that dropped every keystroke; without a palette
 * behind it, the honest header is one with no search affordance at all.
 *
 * ## Why the ref is a second context
 *
 * One `RefObject` field on this value made the React Compiler treat the whole
 * object as ref-like and refuse every render-time read of it, so `isOpen` and
 * `onOpen` were unreadable too and `HeaderSearchBar` bailed out with six
 * findings on a file containing no `useRef` at all. That is an
 * over-approximation in the compiler rather than a rule this code breaks, and
 * #779 chose the split over an opt-out: a directive here would make one shared
 * component uncompilable in all three consuming apps, and this package is
 * phase 2 of the rollout charted in #649. Keeping the ref in its own context
 * leaves the value a plain boolean and a callback, which the compiler reads
 * freely.
 */
export interface SearchTriggerValue {
	/** Opens the palette. The trigger's own ref is what focus returns to on close. */
	readonly onOpen: () => void;
	/** Whether the palette is open, so the trigger can carry `aria-expanded`. */
	readonly isOpen: boolean;
}

const SearchTriggerContext = createContext<SearchTriggerValue | null>(null);

/**
 * Where the trigger button lands, so the palette can put focus back on it.
 *
 * The palette cannot use Radix's `DialogTrigger`, because the button is in this
 * package and the palette is in the app, and Radix restores focus through that
 * trigger's ref while suppressing its own fallback to the previously focused
 * element. With no ref to restore to, Escape drops focus on `<body>`. This is
 * that ref, and it is separate from {@link SearchTriggerValue} for the reason in
 * this module's header.
 */
const SearchTriggerRefContext = createContext<RefObject<HTMLButtonElement | null> | null>(null);

export function SearchTriggerProvider({
	children,
	triggerRef,
	value,
}: {
	readonly children: ReactNode;
	readonly triggerRef: RefObject<HTMLButtonElement | null>;
	readonly value: SearchTriggerValue;
}) {
	return (
		<SearchTriggerContext value={value}>
			<SearchTriggerRefContext value={triggerRef}>{children}</SearchTriggerRefContext>
		</SearchTriggerContext>
	);
}

/** The palette handle, or null in an app that mounts none. */
export function useSearchTrigger(): SearchTriggerValue | null {
	return useContext(SearchTriggerContext);
}

/** Where focus returns when the palette closes, or null in an app that mounts none. */
export function useSearchTriggerRef(): RefObject<HTMLButtonElement | null> | null {
	return useContext(SearchTriggerRefContext);
}
