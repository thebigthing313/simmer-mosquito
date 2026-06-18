import { InputGroupButton } from '@simmer-mosquito/ui-web/components/ui/input-group';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Loader2Icon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { SearchInput } from '../input/search-input';
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
 */
export function MapSearch({ map }: { readonly map: MapboxMap | null }) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [results, setResults] = useState<readonly MapboxSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectingId, setSelectingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const requestId = useRef(0);
	const retrieveController = useRef<AbortController | null>(null);
	const sessionToken = useRef(createSessionToken());

	const canSearch = getMapboxToken().trim().length > 0;
	const trimmedQuery = query.trim();
	const showResults = open && trimmedQuery.length > 0;

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

	function resetSearch() {
		retrieveController.current?.abort();
		setSelectingId(null);
		setQuery('');
		setResults([]);
		setError(null);
		sessionToken.current = createSessionToken();
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
				<div className="w-[min(22rem,calc(100vw-7rem))]">
					<SearchInput
						aria-label="Search for a location"
						className="h-10 border-border/70 bg-background/85 text-sm shadow-md ring-1 ring-black/[0.03] backdrop-blur-sm supports-[backdrop-filter]:bg-background/75"
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
						placeholder={canSearch ? 'Search for a location…' : 'Mapbox token required'}
						value={query}
					/>
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				className="w-[min(22rem,calc(100vw-7rem))] p-1"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<SearchResults
					error={error}
					isLoading={isLoading}
					onSelect={selectResult}
					query={trimmedQuery}
					results={results}
					selectingId={selectingId}
				/>
			</PopoverContent>
		</Popover>
	);
}

function SearchResults({
	error,
	isLoading,
	onSelect,
	query,
	results,
	selectingId,
}: {
	readonly error: string | null;
	readonly isLoading: boolean;
	readonly onSelect: (result: MapboxSearchResult) => void;
	readonly query: string;
	readonly results: readonly MapboxSearchResult[];
	readonly selectingId: string | null;
}) {
	if (query.length < MIN_QUERY_LENGTH) {
		return <SearchMessage>Type at least {MIN_QUERY_LENGTH} characters</SearchMessage>;
	}
	if (isLoading) {
		return (
			<SearchMessage>
				<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
				Searching
			</SearchMessage>
		);
	}
	if (error !== null) {
		return <SearchMessage>{error}</SearchMessage>;
	}
	if (results.length === 0) {
		return <SearchMessage>No places found</SearchMessage>;
	}

	return (
		<div className="grid max-h-72 gap-1 overflow-y-auto">
			{results.map((result) => (
				<button
					className={cn(
						'grid min-h-11 w-full min-w-0 gap-0.5 rounded-sm px-2.5 py-2 text-left text-sm outline-none',
						'hover:bg-accent/60 hover:text-accent-foreground focus-visible:bg-accent/60 focus-visible:text-accent-foreground',
					)}
					disabled={selectingId !== null}
					key={result.id}
					onClick={() => onSelect(result)}
					type="button"
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
					<span className="truncate text-xs text-muted-foreground">{result.description}</span>
				</button>
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
