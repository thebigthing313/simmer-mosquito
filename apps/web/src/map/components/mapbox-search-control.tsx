import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Loader2Icon, SearchIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getMapboxAccessToken } from '../hooks/use-map-instance';

interface MapboxSearchResult {
	readonly id: string;
	readonly mapboxId: string;
	readonly label: string;
	readonly description: string;
}

interface MapboxResolvedSearchResult {
	readonly center: readonly [number, number];
	readonly bbox: readonly [number, number, number, number] | null;
}

interface MapboxSuggestion {
	readonly mapbox_id: string;
	readonly name: string;
	readonly name_preferred?: string;
	readonly feature_type: string;
	readonly address?: string;
	readonly full_address?: string;
	readonly place_formatted?: string;
}

interface MapboxSuggestResponse {
	readonly suggestions?: readonly MapboxSuggestion[];
}

interface MapboxRetrieveFeature {
	readonly geometry?: {
		readonly coordinates?: readonly number[];
		readonly type?: string;
	};
	readonly bbox?: readonly [number, number, number, number];
}

interface MapboxRetrieveResponse {
	readonly features?: readonly MapboxRetrieveFeature[];
}

export function MapboxSearchControl({ map }: { readonly map: MapboxMap | null }) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [results, setResults] = useState<readonly MapboxSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectingId, setSelectingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const requestId = useRef(0);
	const retrieveController = useRef<AbortController | null>(null);
	const sessionToken = useRef(createMapboxSessionToken());
	const accessToken = getMapboxAccessToken().trim();
	const canSearch = accessToken.length > 0;
	const trimmedQuery = query.trim();
	const shouldShowResults = open && trimmedQuery.length > 0;

	useEffect(() => {
		if (!shouldShowResults || trimmedQuery.length < 3 || !canSearch) {
			setResults([]);
			setIsLoading(false);
			setError(null);
			setSelectingId(null);
			return;
		}

		const controller = new AbortController();
		const currentRequestId = requestId.current + 1;
		requestId.current = currentRequestId;
		const timeoutId = window.setTimeout(() => {
			setIsLoading(true);
			setSelectingId(null);
			setError(null);
			void fetch(
				createMapboxSuggestUrl({
					accessToken,
					map,
					query: trimmedQuery,
					sessionToken: sessionToken.current,
				}),
				{
					signal: controller.signal,
				},
			)
				.then(async (response) => {
					if (!response.ok) {
						throw new Error(`Mapbox search failed with ${response.status}`);
					}
					return (await response.json()) as MapboxSuggestResponse;
				})
				.then((body) => {
					if (requestId.current !== currentRequestId) {
						return;
					}
					setResults((body.suggestions ?? []).map(toSearchResult));
				})
				.catch((unknownError: unknown) => {
					if (unknownError instanceof DOMException && unknownError.name === 'AbortError') {
						return;
					}
					if (requestId.current === currentRequestId) {
						setResults([]);
						setError('Search unavailable');
					}
				})
				.finally(() => {
					if (requestId.current === currentRequestId) {
						setIsLoading(false);
					}
				});
		}, 180);

		return () => {
			window.clearTimeout(timeoutId);
			controller.abort();
		};
	}, [accessToken, canSearch, map, shouldShowResults, trimmedQuery]);

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

		void fetch(createMapboxRetrieveUrl(result.mapboxId, accessToken, sessionToken.current), {
			signal: controller.signal,
		})
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Mapbox retrieve failed with ${response.status}`);
				}
				return (await response.json()) as MapboxRetrieveResponse;
			})
			.then((body) => {
				const resolvedResult = toResolvedSearchResult(body);
				if (resolvedResult === null) {
					throw new Error('Mapbox retrieve did not include coordinates');
				}
				setQuery(result.label);
				moveMapToSearchResult(map, resolvedResult);
				setOpen(false);
				setResults([]);
				sessionToken.current = createMapboxSessionToken();
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

	useEffect(() => {
		return () => retrieveController.current?.abort();
	}, []);

	return (
		<Popover open={shouldShowResults} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<div className="relative w-[min(24rem,calc(100vw-8rem))]">
					<SearchIcon
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						aria-label="Search map"
						className="h-9 bg-background pr-9 pl-9 text-[0.86rem] shadow-md"
						disabled={!canSearch}
						onChange={(event) => {
							retrieveController.current?.abort();
							setSelectingId(null);
							setQuery(event.target.value);
							setOpen(true);
						}}
						onFocus={() => setOpen(trimmedQuery.length > 0)}
						placeholder={canSearch ? 'Search places' : 'Mapbox token required'}
						value={query}
					/>
					{query.length > 0 ? (
						<button
							aria-label="Clear map search"
							className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
							onClick={() => {
								retrieveController.current?.abort();
								setSelectingId(null);
								setQuery('');
								setResults([]);
								setError(null);
								sessionToken.current = createMapboxSessionToken();
							}}
							type="button"
						>
							<XIcon aria-hidden="true" className="size-4" />
						</button>
					) : null}
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				className="w-[min(24rem,calc(100vw-8rem))] p-1"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<MapboxSearchResults
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

function MapboxSearchResults({
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
	if (query.length < 3) {
		return <SearchMessage>Type at least 3 characters</SearchMessage>;
	}

	if (isLoading) {
		return (
			<SearchMessage>
				<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
				Searching Mapbox
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
						'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
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

function createMapboxSuggestUrl({
	accessToken,
	map,
	query,
	sessionToken,
}: {
	readonly accessToken: string;
	readonly map: MapboxMap | null;
	readonly query: string;
	readonly sessionToken: string;
}): string {
	const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
	url.searchParams.set('access_token', accessToken);
	url.searchParams.set('q', query);
	url.searchParams.set('session_token', sessionToken);
	url.searchParams.set('limit', '6');
	url.searchParams.set('types', 'address,poi,category,place,locality,neighborhood,region,postcode');

	if (map !== null) {
		const center = map.getCenter();
		url.searchParams.set('proximity', `${center.lng},${center.lat}`);
	}

	return url.toString();
}

function createMapboxRetrieveUrl(
	mapboxId: string,
	accessToken: string,
	sessionToken: string,
): string {
	const url = new URL(
		`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`,
	);
	url.searchParams.set('access_token', accessToken);
	url.searchParams.set('session_token', sessionToken);

	return url.toString();
}

function toSearchResult(suggestion: MapboxSuggestion): MapboxSearchResult {
	const label = suggestion.name_preferred ?? suggestion.name;
	const description =
		suggestion.full_address ??
		suggestion.place_formatted ??
		suggestion.address ??
		formatSearchFeatureType(suggestion.feature_type);

	return {
		id: suggestion.mapbox_id,
		mapboxId: suggestion.mapbox_id,
		label,
		description,
	};
}

function toResolvedSearchResult(
	response: MapboxRetrieveResponse,
): MapboxResolvedSearchResult | null {
	const feature = response.features?.find((candidate) => {
		const [lng, lat] = candidate.geometry?.coordinates ?? [];
		return (
			candidate.geometry?.type === 'Point' && typeof lng === 'number' && typeof lat === 'number'
		);
	});

	const coordinates = feature?.geometry?.coordinates;
	if (coordinates === undefined) {
		return null;
	}

	const [lng, lat] = coordinates;
	if (typeof lng !== 'number' || typeof lat !== 'number') {
		return null;
	}

	return {
		center: [lng, lat],
		bbox: feature?.bbox ?? null,
	};
}

function moveMapToSearchResult(map: MapboxMap, result: MapboxResolvedSearchResult): void {
	if (result.bbox !== null) {
		const [west, south, east, north] = result.bbox;
		map.fitBounds(
			[
				[west, south],
				[east, north],
			],
			{
				duration: 700,
				maxZoom: 16,
				padding: 72,
			},
		);
		return;
	}

	map.flyTo({
		center: [result.center[0], result.center[1]],
		duration: 700,
		essential: true,
		zoom: Math.max(map.getZoom(), 14),
	});
}

function formatSearchFeatureType(featureType: string): string {
	switch (featureType) {
		case 'poi':
			return 'Point of interest';
		case 'category':
			return 'Places category';
		default:
			return featureType;
	}
}

function createMapboxSessionToken(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
