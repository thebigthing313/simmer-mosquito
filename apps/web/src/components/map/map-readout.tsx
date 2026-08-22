import type { MeasurementSystem } from '@simmer-mosquito/mapping';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MAP_CHROME_SURFACE } from './chrome';
import { formatLatLng } from './map-point-search';

const CopyIcon = iconRegistry.actions.copy.icon;

/** How wide a stretch of the centre row to measure the ground distance across. */
const SAMPLE_PX = 100;
/** The longest the scale bar may draw. The rounded distance is chosen to fit. */
const MAX_BAR_PX = 96;

interface ReadoutState {
	readonly lat: number;
	readonly lng: number;
	readonly zoom: number;
	/** Degrees clockwise from north, normalised to 0–359. */
	readonly bearing: number;
	readonly metersPerPixel: number;
}

/**
 * Where the map is looking, along its bottom edge: centre, bearing, zoom, scale.
 *
 * The centre coordinate is the piece that leaves the screen. An operator on the
 * phone with a crew reads it out, and a habitat that has to be described to
 * somebody who is standing there is described by its coordinate, so it carries a
 * copy button rather than asking anyone to transcribe six decimal places.
 *
 * Bearing and zoom are here because the map can be in a state a reader did not
 * choose — a stray two-finger twist rotates it, and a fit-to-data jumps the
 * zoom. A number is how they tell.
 *
 * Every field is pinned to the width of its longest value and the digits are
 * tabular. The numbers change on every frame of a drag, and a strip that
 * resized as they did would slide the copy button out from under the pointer.
 */
export function MapReadout({
	map,
	system = 'us',
}: {
	readonly map: MapboxMap | null;
	readonly system?: MeasurementSystem;
}) {
	const state = useMapReadout(map);
	const coordinates = state === null ? '' : formatLatLng(state.lat, state.lng);

	const onCopy = useCallback(() => {
		// `writeText` rejects without a secure context or clipboard permission, and
		// a button that does nothing silently is worse than one that says so.
		navigator.clipboard.writeText(coordinates).then(
			() => toast.success('Coordinates copied', { description: coordinates }),
			() => toast.error('Could not copy the coordinates to the clipboard.'),
		);
	}, [coordinates]);

	if (state === null) {
		return null;
	}

	const scale = scaleBar(state.metersPerPixel, system);

	return (
		<div
			className={cn(
				'pointer-events-auto flex items-center gap-2 rounded-lg py-1 pr-1 pl-2.5 text-xs shadow-md',
				MAP_CHROME_SURFACE,
			)}
		>
			<span className="inline-block w-[23ch] tabular-nums">
				<span className="sr-only">Map centre </span>
				{coordinates}
			</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						aria-label="Copy coordinates"
						className="text-foreground/75 hover:text-foreground"
						onClick={onCopy}
						size="icon-xs"
						type="button"
						variant="ghost"
					>
						<CopyIcon aria-hidden="true" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Copy coordinates</TooltipContent>
			</Tooltip>

			<ReadoutDivider />
			<span className="inline-block w-[4ch] text-right tabular-nums text-muted-foreground">
				<span className="sr-only">Bearing </span>
				{Math.round(state.bearing)}°
			</span>

			<ReadoutDivider />
			<span className="inline-block w-[5ch] text-right tabular-nums text-muted-foreground">
				<span className="sr-only">Zoom </span>z{state.zoom.toFixed(1)}
			</span>

			<ReadoutDivider />
			<span className="flex items-center gap-1.5 pr-1.5 text-muted-foreground">
				<span className="sr-only">Scale </span>
				{/* The bar's own length is the reading, so it varies. Its slot does not. */}
				<span aria-hidden="true" className="flex justify-start" style={{ width: MAX_BAR_PX }}>
					<span
						className="h-1.5 border-muted-foreground/60 border-r border-b border-l"
						style={{ width: scale.barPx }}
					/>
				</span>
				<span className="inline-block w-[8ch] tabular-nums">{scale.label}</span>
			</span>
		</div>
	);
}

function ReadoutDivider() {
	return <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-border/70" />;
}

/** The camera, re-read on every move so the numbers track the drag rather than settle after it. */
function useMapReadout(map: MapboxMap | null): ReadoutState | null {
	const [state, setState] = useState<ReadoutState | null>(null);

	useEffect(() => {
		if (map === null) {
			setState(null);
			return;
		}
		const sync = () => {
			const center = map.getCenter();
			// Measured off the map rather than derived from the zoom: unprojecting two
			// points on the centre row is the ground distance the reader is looking
			// at, whatever the latitude and whatever the camera is doing.
			const y = map.getContainer().clientHeight / 2;
			const left = map.unproject([0, y]);
			const right = map.unproject([SAMPLE_PX, y]);
			setState({
				lat: center.lat,
				lng: center.lng,
				zoom: map.getZoom(),
				bearing: (map.getBearing() + 360) % 360,
				metersPerPixel: left.distanceTo(right) / SAMPLE_PX,
			});
		};
		sync();
		map.on('move', sync);
		return () => {
			map.off('move', sync);
		};
	}, [map]);

	return state;
}

/** Feet in a metre, and feet in a mile, for choosing which unit the bar stands in. */
const FEET_PER_METER = 3.280_839_895;
const FEET_PER_MILE = 5280;
const METERS_PER_MILE = 1609.344;
/** The steps a scale bar is allowed to stand at, per decade. */
const STEPS = [1, 2, 5] as const;

/**
 * The longest round distance that fits the bar, and how wide to draw it.
 *
 * Rounding the distance and sizing the bar to it, rather than fixing the bar and
 * labelling whatever it happens to span, is what makes it readable: "500 ft" can
 * be laid against the map by eye, "437 ft" cannot.
 */
function scaleBar(
	metersPerPixel: number,
	system: MeasurementSystem,
): { readonly label: string; readonly barPx: number } {
	const maxMeters = metersPerPixel * MAX_BAR_PX;
	const { meters, label } = roundedDistance(maxMeters, system);
	return { label, barPx: Math.round(meters / metersPerPixel) };
}

/**
 * The chosen distance, in metres for the geometry and as text for the label.
 *
 * It prints the label itself rather than handing the metres to `formatDistance`,
 * which pads to two decimals: a measurement is 2.00 mi, a scale bar is 2 mi.
 */
function roundedDistance(
	maxMeters: number,
	system: MeasurementSystem,
): { readonly meters: number; readonly label: string } {
	if (system === 'metric') {
		if (maxMeters >= 1000) {
			const km = niceNumber(maxMeters / 1000);
			return { meters: km * 1000, label: `${count(km)} km` };
		}
		const m = Math.max(niceNumber(maxMeters), 1);
		return { meters: m, label: `${count(m)} m` };
	}
	const feet = maxMeters * FEET_PER_METER;
	if (feet >= FEET_PER_MILE) {
		const miles = niceNumber(feet / FEET_PER_MILE);
		return { meters: miles * METERS_PER_MILE, label: `${count(miles)} mi` };
	}
	const chosen = Math.max(niceNumber(feet), 1);
	return { meters: chosen / FEET_PER_METER, label: `${count(chosen)} ft` };
}

/** Thousands separated, no trailing zeros: 1,000 rather than 1,000.00. */
function count(value: number): string {
	return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** The largest of 1, 2 or 5 times a power of ten that is no bigger than `value`. */
function niceNumber(value: number): number {
	// A map that has not measured itself yet reports zero, and log10(0) is -Infinity.
	if (!Number.isFinite(value) || value <= 0) {
		return 1;
	}
	const decade = 10 ** Math.floor(Math.log10(value));
	const fits = STEPS.filter((step) => step * decade <= value);
	return (fits.at(-1) ?? STEPS[0]) * decade;
}
