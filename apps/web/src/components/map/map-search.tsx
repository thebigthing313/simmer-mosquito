import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { InputGroupButton } from '@simmer-mosquito/ui-web/components/ui/input-group';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Loader2Icon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { MAP_CHROME_SURFACE } from './chrome';
import { getMapboxToken } from './map-styles';
import {
	createSessionToken,
	type MapboxSearchResult,
	moveMapToResult,
	retrievePlace,
	suggestPlaces,
} from './mapbox-search-client';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 180;

/**
 * Mapbox-powered place search. Debounces suggestions, keeps a session token
 * across the suggest→retrieve pair, and flies the map to the chosen result.
 *
 * It is a combobox, and the ARIA is what makes it one. The suggestions used to
 * be buttons in a popover with no `role`, no `aria-expanded`, and no arrow-key
 * handling: focus stayed in the input, Tab closed the list before reaching it,
 * and a reader on a keyboard could type a place but never choose one. Focus
 * stays in the input on purpose; `aria-activedescendant` is what moves.
 */
export function MapSearch({
	map,
	width,
}: {
	readonly map: MapboxMap | null;
	/**
	 * Match a column of chrome this box sits at the top of, in px. Without one it
	 * takes its own comfortable reading width.
	 */
	readonly width?: number | undefined;
}) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [results, setResults] = useState<readonly MapboxSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectingId, setSelectingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	/** Which suggestion the arrow keys are on. -1 is none, and typing returns to it. */
	const [activeIndex, setActiveIndex] = useState(-1);

	const listId = useId();
	const panelId = `${listId}-panel`;
	const optionId = (index: number) => `${listId}-option-${index}`;

	const requestId = useRef(0);
	const retrieveController = useRef<AbortController | null>(null);
	const sessionToken = useRef(createSessionToken());

	const canSearch = getMapboxToken().trim().length > 0;
	// One measurement for the box and the results under it, so the popover cannot
	// end up a different width from the input it hangs off.
	const shell =
		width === undefined
			? { className: 'w-[min(22rem,calc(100vw-7rem))]', style: undefined }
			: { className: 'max-w-[calc(100vw-7rem)]', style: { width } };
	const trimmedQuery = query.trim();
	const showResults = open && trimmedQuery.length > 0;
	// One decision, read by the panel and by the input's ARIA. Deciding it twice
	// is how `aria-owns` ends up naming a listbox that is not on screen.
	const panel = searchPanel({ error, isLoading, query: trimmedQuery, results });

	useEffect(() => {
		if (!showResults || trimmedQuery.length < MIN_QUERY_LENGTH || !canSearch) {
			setResults([]);
			setIsLoading(false);
			setError(null);
			setSelectingId(null);
			return;
		}

		const controller = new AbortController();
		const currentRequest = requestId.current + 1;
		requestId.current = currentRequest;

		const timeout = window.setTimeout(() => {
			setIsLoading(true);
			setSelectingId(null);
			setError(null);
			suggestPlaces({
				query: trimmedQuery,
				sessionToken: sessionToken.current,
				signal: controller.signal,
				map,
			})
				.then((next) => {
					if (requestId.current === currentRequest) {
						setResults(next);
					}
				})
				.catch((unknownError: unknown) => {
					if (unknownError instanceof DOMException && unknownError.name === 'AbortError') {
						return;
					}
					if (requestId.current === currentRequest) {
						setResults([]);
						setError('Search unavailable');
					}
				})
				.finally(() => {
					if (requestId.current === currentRequest) {
						setIsLoading(false);
					}
				});
		}, DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timeout);
			controller.abort();
		};
	}, [canSearch, map, showResults, trimmedQuery]);

	useEffect(() => {
		return () => retrieveController.current?.abort();
	}, []);

	// A new set of suggestions starts unselected: the old index would point at a
	// different place, and Enter would fly the map somewhere the reader never saw.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the results.
	useEffect(() => {
		setActiveIndex(-1);
	}, [results]);

	function resetSearch() {
		retrieveController.current?.abort();
		setActiveIndex(-1);
		setSelectingId(null);
		setQuery('');
		setResults([]);
		setError(null);
		sessionToken.current = createSessionToken();
	}

	function onArrowKey(key: 'ArrowDown' | 'ArrowUp') {
		if (!showResults) {
			setOpen(true);
			return;
		}
		if (results.length > 0) {
			setActiveIndex((previous) =>
				stepIndex(previous, key === 'ArrowDown' ? 1 : -1, results.length),
			);
		}
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowUp':
				event.preventDefault();
				onArrowKey(event.key);
				return;
			case 'Enter': {
				const chosen = results[activeIndex];
				if (chosen === undefined) {
					// Only when a suggestion is highlighted. Otherwise Enter belongs to
					// the form the input sits in, and swallowing it would be a surprise.
					return;
				}
				event.preventDefault();
				selectResult(chosen);
				return;
			}
			case 'Escape':
				if (showResults) {
					// Handled here rather than by the popover: focus never enters the
					// popover, so Radix's own dismiss listener never sees the key.
					event.preventDefault();
					setOpen(false);
					setActiveIndex(-1);
				}
				return;
			default:
		}
	}

	function selectResult(result: MapboxSearchResult) {
		setSelectingId(result.id);
		setError(null);

		if (map === null) {
			setQuery(result.label);
			setOpen(false);
			setSelectingId(null);
			return;
		}

		retrieveController.current?.abort();
		const controller = new AbortController();
		retrieveController.current = controller;

		retrievePlace({ id: result.id, sessionToken: sessionToken.current, signal: controller.signal })
			.then((resolved) => {
				setQuery(result.label);
				moveMapToResult(map, resolved);
				setOpen(false);
				setResults([]);
				sessionToken.current = createSessionToken();
			})
			.catch((unknownError: unknown) => {
				if (unknownError instanceof DOMException && unknownError.name === 'AbortError') {
					return;
				}
				setError('Search result unavailable');
			})
			.finally(() => {
				if (retrieveController.current === controller) {
					retrieveController.current = null;
					setSelectingId(null);
				}
			});
	}

	return (
		<Popover onOpenChange={setOpen} open={showResults}>
			<PopoverAnchor asChild>
				<div className={shell.className} style={shell.style}>
					<SearchInput
						aria-activedescendant={activeIndex < 0 ? undefined : optionId(activeIndex)}
						aria-autocomplete="list"
						aria-controls={showResults ? panelId : undefined}
						aria-expanded={showResults}
						/*
						 * `aria-owns`, because the popover portals to the end of the body.
						 * `aria-activedescendant` resolves only against a descendant of the
						 * focused element or a subtree it owns, so without this the active
						 * option is unresolvable and the whole keyboard path is invisible
						 * to a screen reader. Only while options exist: owning an id that
						 * is not on screen is its own broken state.
						 */
						aria-owns={panel === 'list' ? listId : undefined}
						aria-label="Search for a location"
						autoComplete="off"
						className={cn('h-10 text-sm shadow-md', MAP_CHROME_SURFACE)}
						disabled={!canSearch}
						endAddon={
							query.length > 0 ? (
								<InputGroupButton aria-label="Clear search" onClick={resetSearch} size="icon-xs">
									<XIcon aria-hidden="true" />
								</InputGroupButton>
							) : null
						}
						onChange={(event) => {
							retrieveController.current?.abort();
							setSelectingId(null);
							setQuery(event.target.value);
							setOpen(true);
						}}
						onFocus={() => setOpen(trimmedQuery.length > 0)}
						onKeyDown={onKeyDown}
						placeholder={canSearch ? 'Search for a location…' : 'Mapbox token required'}
						role="combobox"
						value={query}
					/>
					{/*
					 * Announced from here rather than from the popover. The popover is
					 * mounted at the moment its content changes, and a live region that
					 * appears in the same frame as its text is not reliably read.
					 */}
					<span aria-live="polite" className="sr-only" role="status">
						{showResults ? searchStatus(panel, error, results) : ''}
					</span>
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				className={cn(shell.className, 'p-1')}
				id={panelId}
				onOpenAutoFocus={(event) => event.preventDefault()}
				style={shell.style}
			>
				<SearchResults
					activeIndex={activeIndex}
					error={error}
					listId={listId}
					onHover={setActiveIndex}
					onSelect={selectResult}
					optionId={optionId}
					panel={panel}
					results={results}
					selectingId={selectingId}
				/>
			</PopoverContent>
		</Popover>
	);
}

/** The next active option, wrapping at both ends. -1 (none) steps to either end. */
export function stepIndex(previous: number, step: number, length: number): number {
	const next = previous + step;
	if (next < 0) {
		return length - 1;
	}
	return next >= length ? 0 : next;
}

/** Which of the five things the popover can show. Decided once, in the parent. */
type SearchPanel = 'hint' | 'loading' | 'error' | 'empty' | 'list';

function searchPanel({
	error,
	isLoading,
	query,
	results,
}: {
	readonly error: string | null;
	readonly isLoading: boolean;
	readonly query: string;
	readonly results: readonly MapboxSearchResult[];
}): SearchPanel {
	if (query.length < MIN_QUERY_LENGTH) {
		return 'hint';
	}
	if (isLoading) {
		return 'loading';
	}
	if (error !== null) {
		return 'error';
	}
	return results.length === 0 ? 'empty' : 'list';
}

/** What the live region says, so a reader who cannot see the list still hears it. */
function searchStatus(
	panel: SearchPanel,
	error: string | null,
	results: readonly MapboxSearchResult[],
): string {
	switch (panel) {
		case 'hint':
			return '';
		case 'loading':
			return 'Searching';
		case 'error':
			return error ?? '';
		case 'empty':
			return 'No places found';
		default:
			return results.length === 1 ? '1 place found' : `${results.length} places found`;
	}
}

function SearchResults({
	activeIndex,
	error,
	listId,
	onHover,
	onSelect,
	optionId,
	panel,
	results,
	selectingId,
}: {
	readonly activeIndex: number;
	readonly error: string | null;
	readonly listId: string;
	readonly onHover: (index: number) => void;
	readonly onSelect: (result: MapboxSearchResult) => void;
	readonly optionId: (index: number) => string;
	readonly panel: SearchPanel;
	readonly results: readonly MapboxSearchResult[];
	readonly selectingId: string | null;
}) {
	// Keep the highlighted option in the scroller. Arrowing past the fold
	// otherwise moves a highlight nobody can see, which is the same as no
	// highlight at all.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the active option.
	useEffect(() => {
		if (activeIndex < 0) {
			return;
		}
		document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
	}, [activeIndex]);

	if (panel === 'hint') {
		return <SearchMessage>Type at least {MIN_QUERY_LENGTH} characters</SearchMessage>;
	}
	if (panel === 'loading') {
		return (
			<SearchMessage>
				<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
				Searching
			</SearchMessage>
		);
	}
	if (panel === 'error') {
		return <SearchMessage>{error}</SearchMessage>;
	}
	if (panel === 'empty') {
		return <SearchMessage>No places found</SearchMessage>;
	}

	return (
		// Options, not buttons. A button inside a listbox is a second interactive
		// thing for a screen reader to describe, and the tab stop it brings is the
		// one that used to close this list before anybody reached it.
		<div
			aria-label="Search results"
			className="grid max-h-72 gap-1 overflow-y-auto"
			id={listId}
			role="listbox"
		>
			{results.map((result, index) => (
				// The keyboard half of this control is on the combobox input, which is
				// where focus stays. Enter there selects the active option; an option's
				// own key handler would never fire, because an option never holds focus.
				// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is on the input.
				<div
					aria-selected={index === activeIndex}
					className={cn(
						'grid min-h-11 w-full min-w-0 cursor-default gap-0.5 rounded-sm px-2.5 py-2 text-left text-sm outline-none',
						index === activeIndex && 'bg-accent/60 text-accent-foreground',
						selectingId !== null && 'pointer-events-none opacity-60',
					)}
					id={optionId(index)}
					key={result.id}
					onClick={() => onSelect(result)}
					onMouseMove={() => onHover(index)}
					role="option"
					// Not in the tab order: the input is the combobox's only tab stop and
					// `aria-activedescendant` is what moves.
					tabIndex={-1}
				>
					<span className="flex min-w-0 items-center gap-2">
						<span className="truncate font-semibold">{result.label}</span>
						{selectingId === result.id ? (
							<Loader2Icon
								aria-hidden="true"
								className="size-3.5 shrink-0 animate-spin text-muted-foreground"
							/>
						) : null}
					</span>
					<span className="truncate text-muted-foreground text-xs">{result.description}</span>
				</div>
			))}
		</div>
	);
}

function SearchMessage({ children }: { readonly children: ReactNode }) {
	return (
		<div className="flex min-h-20 items-center justify-center gap-2 px-3 py-4 text-center text-sm text-muted-foreground">
			{children}
		</div>
	);
}
