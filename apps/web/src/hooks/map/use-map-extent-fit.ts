import { type BoundingBox, formatBoundingBox } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { insetPadding, type MapInset } from '../../components/map/map-inset';
import { useMapExtent } from './use-map-extent';
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

/**
 * Frames the records a map draws: fits on first load, and refits whenever the
 * source changes. Panning and zooming are left alone.
 *
 * The source is an extent URL the server answers for the current filters, or
 * a box the page computed from local rows. A refit off an extent URL is
 * skipped when the whole extent already sits inside the visible part of the
 * canvas; the first fit and a local box are never skipped. `inset` widens
 * the fit margin by the chrome floating over the map.
 */
export function useMapExtentFit(
	map: MapboxMap | null,
	isLoaded: boolean,
	source: MapExtentFitSource | null,
	inset?: MapInset,
): void {
	const url = source !== null && 'url' in source ? source.url : null;
	const localBounds = source !== null && 'bounds' in source ? source.bounds : null;

	const { extent } = useMapExtent(url);

	const bounds = url === null ? localBounds : extent;
	// Keyed on the source as well as the box: re-running the same filter set is a
	// pan-and-forget, but picking a *different* filter that happens to cover the
	// same ground is a new decision, and pulls the camera back onto it when the
	// reader has panned away from it.
	const fitKey = bounds === null ? null : `${url ?? 'local'}|${formatBoundingBox(bounds)}`;

	const fitted = useRef<FitLedger>({ map: null, key: null });
	// Chrome floating over the map is added to the fit margin, so a framed set
	// sits in the part of the canvas the reader can see rather than under a panel.
	const padding = insetPadding(FIT_PADDING, inset);
	const paddingKey = `${padding.top}|${padding.right}|${padding.bottom}|${padding.left}`;

	// biome-ignore lint/correctness/useExhaustiveDependencies: padding keyed by value.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || bounds === null || fitKey === null) {
			return;
		}
		frameOnce(fitted.current, { map, bounds, fitKey, url, padding });
	}, [map, isLoaded, bounds, fitKey, paddingKey]);
}

/** What the camera was last framed on, so one key is fitted once per GL instance. */
interface FitLedger {
	map: MapboxMap | null;
	key: string | null;
}

/** One frame the hook has been asked for, with the key that names it. */
interface FitRequest {
	readonly map: MapboxMap;
	readonly bounds: BoundingBox;
	readonly fitKey: string;
	readonly url: string | null;
	readonly padding: ReturnType<typeof insetPadding>;
}

/**
 * Frame the request unless the ledger says this key was already framed on this
 * map, and record it either way. A fresh GL instance always re-frames, even for
 * a key it already fitted; a repeated key on the same instance is a pan the
 * reader made and is left alone.
 */
function frameOnce(ledger: FitLedger, { map, bounds, fitKey, url, padding }: FitRequest): void {
	const isFirstFit = ledger.map !== map;
	if (!isFirstFit && ledger.key === fitKey) {
		return;
	}
	ledger.map = map;
	ledger.key = fitKey;
	if (isFirstFit || isRefitOwed(map, url, bounds)) {
		fitMapToBounds(map, bounds, isFirstFit ? 0 : FIT_DURATION_MS, padding);
	}
}

/**
 * Whether a changed key still moves the camera. A locally-computed box always
 * does; an extent URL's does only when some of the extent is off screen.
 */
function isRefitOwed(map: MapboxMap, url: string | null, bounds: BoundingBox): boolean {
	return url === null || !isInView(map, bounds);
}

/**
 * Whether the whole of `extent` sits inside what the map is showing.
 *
 * `getBounds` is the view net of the map's padding, so a record under the
 * results panel does not count as on screen, and it is null before the map has
 * a transform, which reads as not in view so the fit still runs. Longitude is
 * compared under a shift of a whole turn either way as well as none: mapbox
 * reports a camera past the antimeridian unwrapped, west 170 to east 190, while
 * the server writes the same ground at -170, and a comparison that read only
 * the raw numbers would fit a camera that had nothing to find. The failure it
 * leaves open runs the safe way, a fit that was not needed rather than a set
 * left off screen: an extent whose records straddle the line arrives from
 * `ST_Extent` as a box spanning the long way round, and is never in view. It
 * does not share `normalizeBounds` in `explorer/use-map-bounds.ts`, which reads
 * the same unwrapped camera and answers a different question: that one sends
 * the whole world for a view across the line, because the endpoint takes one
 * box, and a whole-world view here would hold every extent and skip a fit that
 * was owed (#933).
 */
function isInView(map: MapboxMap, extent: BoundingBox): boolean {
	const view = map.getBounds();
	if (view === null) {
		return false;
	}
	const south = view.getSouth();
	const north = view.getNorth();
	if (extent.south < south || extent.north > north) {
		return false;
	}
	const west = view.getWest();
	const east = view.getEast();
	return [0, 360, -360].some((turn) => extent.west + turn >= west && extent.east + turn <= east);
}

function fitMapToBounds(
	map: MapboxMap,
	bounds: BoundingBox,
	duration: number,
	padding: ReturnType<typeof insetPadding>,
): void {
	// One record (or many stacked on one address) collapses the box to a point,
	// which fitBounds cannot frame, so ease onto it at a sane zoom instead.
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
