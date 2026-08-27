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
 */
export interface SearchTriggerValue {
	/** Opens the palette. The trigger's own ref is what focus returns to on close. */
	readonly onOpen: () => void;
	/** Whether the palette is open, so the trigger can carry `aria-expanded`. */
	readonly isOpen: boolean;
	/**
	 * Where the trigger button lands, so the palette can put focus back on it.
	 *
	 * The palette cannot use Radix's `DialogTrigger` — the button is in this
	 * package and the palette is in the app — and Radix restores focus through
	 * that trigger's ref while suppressing its own fallback. With no ref to
	 * restore to, Escape drops focus on `<body>`. This is that ref.
	 */
	readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

const SearchTriggerContext = createContext<SearchTriggerValue | null>(null);

export function SearchTriggerProvider({
	children,
	value,
}: {
	readonly children: ReactNode;
	readonly value: SearchTriggerValue;
}) {
	return <SearchTriggerContext value={value}>{children}</SearchTriggerContext>;
}

/** The palette handle, or null in an app that mounts none. */
export function useSearchTrigger(): SearchTriggerValue | null {
	return useContext(SearchTriggerContext);
}
