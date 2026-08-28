import { type BoundingBox, formatBoundingBox, isBoundingBox } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { insetPadding, type MapInset } from './map-inset';
import { isMapLive } from './use-mapbox-map';

/**
 * Where a canvas's frame comes from: a tileset extent endpoint the server answers
 * for the current filters, or a box the page already computed from local rows.
 */
export type MapExtentFitSource = { readonly url: string } | { readonly bounds: BoundingBox | null };

/** Breathing room (px) between the framed data and the map edge. */
const FIT_PADDING = 56;
/** Ceiling on the fitted zoom, so a tight cluster doesn't slam into street level. */
const FIT_MAX_ZOOM = 16;
/** Zoom used when the extent collapses to a single point. */
const FIT_POINT_ZOOM = 15;
const FIT_DURATION_MS = 600;
const extentStaleTimeMs = 30_000;

/**
 * Frame the records a map draws: fit on first load, and refit whenever the
 * filters change. Panning and zooming are left alone — only a new filter set (a
 * new extent URL) or a new locally-computed box moves the camera again.
 *
 * Vector tiles only carry what the viewport already framed, so a filtered set
 * whose records sit off-screen is invisible until someone finds it. The extent
 * endpoint answers "where is this filter's data" in one round-trip, from the same
 * filter predicates that build the tiles.
 */
export function useMapExtentFit(
	map: MapboxMap | null,
	isLoaded: boolean,
	source: MapExtentFitSource | null,
	inset?: MapInset,
): void {
	const url = source !== null && 'url' in source ? source.url : null;
	const localBounds = source !== null && 'bounds' in source ? source.bounds : null;

	const query = useQuery({
		enabled: url !== null,
		queryKey: ['map-extent', url],
		queryFn: ({ signal }) => fetchMapExtent(url ?? '', signal),
		staleTime: extentStaleTimeMs,
	});

	const bounds = url === null ? localBounds : (query.data ?? null);
	// Keyed on the source as well as the box: re-running the same filter set is a
	// pan-and-forget, but picking a *different* filter that happens to cover the
	// same ground should still pull the camera back onto it.
	const fitKey = bounds === null ? null : `${url ?? 'local'}|${formatBoundingBox(bounds)}`;

	const fittedKeyRef = useRef<string | null>(null);
	const fittedMapRef = useRef<MapboxMap | null>(null);
	// Chrome floating over the map is added to the fit margin, so a framed set
	// sits in the part of the canvas the reader can see rather than under a panel.
	const padding = insetPadding(FIT_PADDING, inset);
	const paddingKey = `${padding.top}|${padding.right}|${padding.bottom}|${padding.left}`;

	// biome-ignore lint/correctness/useExhaustiveDependencies: padding keyed by value.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || bounds === null || fitKey === null) {
			return;
		}
		// A fresh GL instance always re-frames, even for a key it already fitted.
		const isFirstFit = fittedMapRef.current !== map;
		if (!isFirstFit && fittedKeyRef.current === fitKey) {
			return;
		}
		fittedMapRef.current = map;
		fittedKeyRef.current = fitKey;
		fitMapToBounds(map, bounds, isFirstFit ? 0 : FIT_DURATION_MS, padding);
	}, [map, isLoaded, bounds, fitKey, paddingKey]);
}

function fitMapToBounds(
	map: MapboxMap,
	bounds: BoundingBox,
	duration: number,
	padding: ReturnType<typeof insetPadding>,
): void {
	// One record (or many stacked on one address) collapses the box to a point,
	// which fitBounds can't frame — ease onto it at a sane zoom instead.
	if (bounds.west === bounds.east && bounds.south === bounds.north) {
		map.easeTo({
			center: [bounds.west, bounds.south],
			zoom: Math.max(map.getZoom(), FIT_POINT_ZOOM),
			duration,
			padding,
		});
		return;
	}

	map.fitBounds(
		[
			[bounds.west, bounds.south],
			[bounds.east, bounds.north],
		],
		{ padding, maxZoom: FIT_MAX_ZOOM, duration },
	);
}

async function fetchMapExtent(url: string, signal: AbortSignal): Promise<BoundingBox | null> {
	const response = await sessionFetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Map extent request failed (${response.status}).`);
	}

	const body = (await response.json()) as { readonly extent?: BoundingBox | null };
	// Null is the server's "nothing matched" — the caller keeps its current view.
	const extent = body.extent ?? null;
	return extent !== null && isBoundingBox(extent) ? extent : null;
}
