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
	readonly label: string;
	readonly description: string;
	readonly center: readonly [number, number];
	readonly bbox: readonly [number, number, number, number] | null;
}

interface MapboxFeature {
	readonly id?: string;
	readonly place_name?: string;
	readonly text?: string;
	readonly center?: readonly [number, number];
	readonly bbox?: readonly [number, number, number, number];
	readonly properties?: {
		readonly address?: string;
	};
}

interface MapboxGeocodeResponse {
	readonly features?: readonly MapboxFeature[];
}

export function MapboxSearchControl({ map }: { readonly map: MapboxMap | null }) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [results, setResults] = useState<readonly MapboxSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const requestId = useRef(0);
	const accessToken = getMapboxAccessToken().trim();
	const canSearch = accessToken.length > 0;
	const trimmedQuery = query.trim();

	useEffect(() => {
		if (!open || trimmedQuery.length < 3 || !canSearch) {
			setResults([]);
			setIsLoading(false);
			setError(null);
			return;
		}

		const controller = new AbortController();
		const currentRequestId = requestId.current + 1;
		requestId.current = currentRequestId;
		const timeoutId = window.setTimeout(() => {
			setIsLoading(true);
			setError(null);
			void fetch(createMapboxGeocodeUrl(trimmedQuery, accessToken), {
				signal: controller.signal,
			})
				.then(async (response) => {
					if (!response.ok) {
						throw new Error(`Mapbox search failed with ${response.status}`);
					}
					return (await response.json()) as MapboxGeocodeResponse;
				})
				.then((body) => {
					if (requestId.current !== currentRequestId) {
						return;
					}
					setResults((body.features ?? []).flatMap(toSearchResult));
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
	}, [accessToken, canSearch, open, trimmedQuery]);

	function selectResult(result: MapboxSearchResult) {
		setQuery(result.label);
		setOpen(false);

		if (map === null) {
			return;
		}

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

	return (
		<Popover open={open} onOpenChange={setOpen}>
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
							setQuery(event.target.value);
							setOpen(true);
						}}
						onFocus={() => setOpen(true)}
						placeholder={canSearch ? 'Search places' : 'Mapbox token required'}
						value={query}
					/>
					{query.length > 0 ? (
						<button
							aria-label="Clear map search"
							className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
							onClick={() => {
								setQuery('');
								setResults([]);
								setError(null);
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
}: {
	readonly error: string | null;
	readonly isLoading: boolean;
	readonly onSelect: (result: MapboxSearchResult) => void;
	readonly query: string;
	readonly results: readonly MapboxSearchResult[];
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
					key={result.id}
					onClick={() => onSelect(result)}
					type="button"
				>
					<span className="truncate font-semibold">{result.label}</span>
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

function createMapboxGeocodeUrl(query: string, accessToken: string): string {
	const url = new URL(
		`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
	);
	url.searchParams.set('access_token', accessToken);
	url.searchParams.set('autocomplete', 'true');
	url.searchParams.set('limit', '6');
	url.searchParams.set('types', 'address,poi,place,locality,neighborhood,region,postcode');

	return url.toString();
}

function toSearchResult(feature: MapboxFeature): readonly MapboxSearchResult[] {
	if (feature.center === undefined) {
		return [];
	}

	const label = feature.text ?? feature.place_name ?? 'Map result';
	const description = feature.place_name ?? label;

	return [
		{
			id: feature.id ?? `${feature.center.join(',')}-${label}`,
			label,
			description,
			center: feature.center,
			bbox: feature.bbox ?? null,
		},
	];
}
