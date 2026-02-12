import { Badge } from '@simmer/ui/components/badge';
import { Button } from '@simmer/ui/components/button';
import { Separator } from '@simmer/ui/components/separator';
import { Switch } from '@simmer/ui/components/switch';
import { createFileRoute } from '@tanstack/react-router';
import {
	Circle,
	Crosshair,
	MapPin,
	MousePointer,
	Move,
	Navigation,
	Pentagon,
	Route as RouteIcon,
	Ruler,
	Trash2,
	ZoomIn,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useMapBoundingBox } from '@/src/hooks/use-map-bounding-box';
import { useMapCenter } from '@/src/hooks/use-map-center';
import {
	useMapCursorPosition,
	useMapDistance,
	useMapEvents,
} from '@/src/hooks/use-map-events';
import { useMapInstance } from '@/src/hooks/use-map-instance';
import { useMapLines } from '@/src/hooks/use-map-lines';
import { useMapMarkers } from '@/src/hooks/use-map-markers';
import { useMapPolygons } from '@/src/hooks/use-map-polygons';
import { useMapSettings } from '@/src/hooks/use-map-settings';
import { useMapViewport } from '@/src/hooks/use-map-viewport';
import type { LngLat } from '@/src/stores/map-store';

export const Route = createFileRoute('/(app)/map-example')({
	beforeLoad: () => ({
		mainOutlet: {
			header: 'Map Toolkit',
			description: 'Hook & store demonstration',
		},
	}),
	component: MapExamplePage,
});

/* ================================================================== */
/*  Main page                                                         */
/* ================================================================== */

function MapExamplePage() {
	return (
		<div className="flex flex-col gap-5">
			<NavigationDemo />
			<Separator className="bg-white/8" />
			<ViewportInfo />
			<Separator className="bg-white/8" />
			<BoundsInfo />
			<Separator className="bg-white/8" />
			<MarkersDemo />
			<Separator className="bg-white/8" />
			<PolygonsDemo />
			<Separator className="bg-white/8" />
			<LinesDemo />
			<Separator className="bg-white/8" />
			<SettingsDemo />
			<Separator className="bg-white/8" />
			<EventsDemo />
			<Separator className="bg-white/8" />
			<DistanceDemo />
		</div>
	);
}

/* ================================================================== */
/*  Section wrapper                                                   */
/* ================================================================== */

function Section({
	icon,
	title,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<span className="text-simmer-green">{icon}</span>
				<h3 className="font-semibold text-xs uppercase tracking-widest opacity-60">
					{title}
				</h3>
			</div>
			{children}
		</div>
	);
}

/* ================================================================== */
/*  1. useMapCenter — Navigation                                      */
/* ================================================================== */

const DEMO_LOCATIONS: { label: string; lngLat: LngLat; zoom: number }[] = [
	{ label: 'New York', lngLat: { lng: -74.006, lat: 40.7128 }, zoom: 12 },
	{ label: 'Los Angeles', lngLat: { lng: -118.2437, lat: 34.0522 }, zoom: 12 },
	{ label: 'Miami', lngLat: { lng: -80.1918, lat: 25.7617 }, zoom: 12 },
	{ label: 'Houston', lngLat: { lng: -95.3698, lat: 29.7604 }, zoom: 12 },
	{ label: 'Chicago', lngLat: { lng: -87.6298, lat: 41.8781 }, zoom: 12 },
];

function NavigationDemo() {
	const { center, flyTo } = useMapCenter();

	return (
		<Section icon={<Navigation className="size-3.5" />} title="useMapCenter">
			<div className="grid grid-cols-3 gap-1.5">
				{DEMO_LOCATIONS.map((loc) => (
					<Button
						key={loc.label}
						variant="ghost"
						size="sm"
						className="justify-start text-[11px]"
						onClick={() => flyTo({ center: loc.lngLat, zoom: loc.zoom })}
					>
						<MapPin className="size-3 text-simmer-green" />
						{loc.label}
					</Button>
				))}
			</div>
			<Readout
				label="Current center"
				value={`${center.lat.toFixed(4)}°, ${center.lng.toFixed(4)}°`}
			/>
		</Section>
	);
}

/* ================================================================== */
/*  2. useMapViewport — Zoom / Pitch / Bearing                       */
/* ================================================================== */

function ViewportInfo() {
	const { zoom, pitch, bearing, zoomTo, setPitch, resetNorth } =
		useMapViewport();

	return (
		<Section icon={<ZoomIn className="size-3.5" />} title="useMapViewport">
			<div className="grid grid-cols-3 gap-2">
				<Readout label="Zoom" value={zoom.toFixed(2)} />
				<Readout label="Pitch" value={`${pitch.toFixed(1)}°`} />
				<Readout label="Bearing" value={`${bearing.toFixed(1)}°`} />
			</div>
			<div className="flex flex-wrap gap-1.5">
				<Button variant="outline" size="sm" className="text-[11px]" onClick={() => zoomTo(6)}>
					Zoom 6
				</Button>
				<Button variant="outline" size="sm" className="text-[11px]" onClick={() => zoomTo(14)}>
					Zoom 14
				</Button>
				<Button variant="outline" size="sm" className="text-[11px]" onClick={() => setPitch(60)}>
					Pitch 60°
				</Button>
				<Button variant="outline" size="sm" className="text-[11px]" onClick={() => resetNorth()}>
					Reset North
				</Button>
			</div>
		</Section>
	);
}

/* ================================================================== */
/*  3. useMapBoundingBox                                              */
/* ================================================================== */

function BoundsInfo() {
	const { bounds, dimensions, fitBounds, containsPoint } =
		useMapBoundingBox();

	const [containsNY, setContainsNY] = useState<boolean | null>(null);

	const checkNY = useCallback(() => {
		setContainsNY(containsPoint({ lng: -74.006, lat: 40.7128 }));
	}, [containsPoint]);

	return (
		<Section icon={<Move className="size-3.5" />} title="useMapBoundingBox">
			{bounds && (
				<div className="grid grid-cols-2 gap-2">
					<Readout label="SW" value={`${bounds.sw.lat.toFixed(3)}°, ${bounds.sw.lng.toFixed(3)}°`} />
					<Readout label="NE" value={`${bounds.ne.lat.toFixed(3)}°, ${bounds.ne.lng.toFixed(3)}°`} />
					{dimensions && (
						<>
							<Readout label="Width" value={`${dimensions.width.toFixed(3)}°`} />
							<Readout label="Height" value={`${dimensions.height.toFixed(3)}°`} />
						</>
					)}
				</div>
			)}
			<div className="flex flex-wrap gap-1.5">
				<Button
					variant="outline"
					size="sm"
					className="text-[11px]"
					onClick={() =>
						fitBounds(
							{ sw: { lng: -80.5, lat: 25.0 }, ne: { lng: -79.5, lat: 26.0 } },
							{ padding: 40 },
						)
					}
				>
					Fit Miami
				</Button>
				<Button variant="outline" size="sm" className="text-[11px]" onClick={checkNY}>
					Contains NYC?
				</Button>
				{containsNY !== null && (
					<Badge variant={containsNY ? 'default' : 'destructive'} className="text-[10px]">
						{containsNY ? 'Yes' : 'No'}
					</Badge>
				)}
			</div>
		</Section>
	);
}

/* ================================================================== */
/*  4. useMapMarkers                                                  */
/* ================================================================== */

let markerCounter = 0;

function MarkersDemo() {
	const {
		markers,
		visibleMarkers,
		addMarker,
		removeMarker,
		removeAllMarkers,
		setMarkerVisibility,
	} = useMapMarkers();
	const { center } = useMapCenter();

	const addAtCenter = useCallback(() => {
		markerCounter++;
		addMarker({
			id: `demo-marker-${markerCounter}`,
			lngLat: { ...center },
			color: ['#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6'][
				markerCounter % 5
			],
			popup: `Marker #${markerCounter}`,
		});
	}, [addMarker, center]);

	return (
		<Section icon={<MapPin className="size-3.5" />} title="useMapMarkers">
			<div className="flex items-center gap-2">
				<Badge variant="outline" className="text-[10px]">
					{markers.length} total
				</Badge>
				<Badge variant="outline" className="text-[10px]">
					{visibleMarkers.length} visible
				</Badge>
			</div>
			<div className="flex flex-wrap gap-1.5">
				<Button variant="outline" size="sm" className="text-[11px]" onClick={addAtCenter}>
					<MapPin className="size-3" />
					Add at center
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="text-[11px]"
					onClick={removeAllMarkers}
					disabled={markers.length === 0}
				>
					<Trash2 className="size-3" />
					Clear all
				</Button>
			</div>
			{markers.length > 0 && (
				<div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
					{markers.map((m) => (
						<div
							key={m.id}
							className="flex items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-white/5"
						>
							<Circle
								className="size-2.5 shrink-0"
								style={{ color: m.color, fill: m.color }}
							/>
							<span className="flex-1 truncate opacity-70">{m.id}</span>
							<Switch
								checked={m.visible !== false}
								onCheckedChange={(v) => setMarkerVisibility(m.id, !!v)}
							/>
							<button
								type="button"
								className="text-white/30 hover:text-simmer-red"
								onClick={() => removeMarker(m.id)}
							>
								<Trash2 className="size-3" />
							</button>
						</div>
					))}
				</div>
			)}
		</Section>
	);
}

/* ================================================================== */
/*  5. useMapPolygons                                                 */
/* ================================================================== */

let polyCounter = 0;

function PolygonsDemo() {
	const { polygons, addPolygon, removeAllPolygons } = useMapPolygons();
	const { center } = useMapCenter();

	const addSquare = useCallback(() => {
		polyCounter++;
		const d = 0.01;
		const { lng, lat } = center;
		addPolygon({
			id: `demo-poly-${polyCounter}`,
			coordinates: [
				[
					[lng - d, lat - d],
					[lng + d, lat - d],
					[lng + d, lat + d],
					[lng - d, lat + d],
					[lng - d, lat - d],
				],
			],
			fillColor: ['#10b981', '#f59e0b', '#8b5cf6'][polyCounter % 3],
			fillOpacity: 0.25,
			strokeColor: ['#10b981', '#f59e0b', '#8b5cf6'][polyCounter % 3],
		});
	}, [addPolygon, center]);

	return (
		<Section icon={<Pentagon className="size-3.5" />} title="useMapPolygons">
			<Badge variant="outline" className="w-fit text-[10px]">
				{polygons.length} polygons
			</Badge>
			<div className="flex flex-wrap gap-1.5">
				<Button variant="outline" size="sm" className="text-[11px]" onClick={addSquare}>
					<Pentagon className="size-3" />
					Add square at center
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="text-[11px]"
					onClick={removeAllPolygons}
					disabled={polygons.length === 0}
				>
					<Trash2 className="size-3" />
					Clear
				</Button>
			</div>
		</Section>
	);
}

/* ================================================================== */
/*  6. useMapLines                                                    */
/* ================================================================== */

let lineCounter = 0;

function LinesDemo() {
	const { lines, addLine, removeAllLines } = useMapLines();
	const { center } = useMapCenter();

	const addLine_ = useCallback(() => {
		lineCounter++;
		const { lng, lat } = center;
		addLine({
			id: `demo-line-${lineCounter}`,
			coordinates: [
				[lng - 0.02, lat - 0.01],
				[lng, lat + 0.015],
				[lng + 0.02, lat - 0.005],
			],
			color: '#f59e0b',
			width: 3,
		});
	}, [addLine, center]);

	return (
		<Section icon={<RouteIcon className="size-3.5" />} title="useMapLines">
			<Badge variant="outline" className="w-fit text-[10px]">
				{lines.length} lines
			</Badge>
			<div className="flex flex-wrap gap-1.5">
				<Button variant="outline" size="sm" className="text-[11px]" onClick={addLine_}>
					<RouteIcon className="size-3" />
					Add line at center
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="text-[11px]"
					onClick={removeAllLines}
					disabled={lines.length === 0}
				>
					<Trash2 className="size-3" />
					Clear
				</Button>
			</div>
		</Section>
	);
}

/* ================================================================== */
/*  7. useMapSettings                                                 */
/* ================================================================== */

function SettingsDemo() {
	const {
		interactionsEnabled,
		terrain3D,
		cursor,
		setInteractionsEnabled,
		setTerrain3D,
		setCursor,
	} = useMapSettings();

	return (
		<Section
			icon={<Crosshair className="size-3.5" />}
			title="useMapSettings"
		>
			<div className="flex flex-col gap-2.5">
				<SettingRow label="Interactions">
					<Switch
						checked={interactionsEnabled}
						onCheckedChange={(v) => setInteractionsEnabled(!!v)}
					/>
				</SettingRow>
				<SettingRow label="3D Terrain">
					<Switch
						checked={terrain3D}
						onCheckedChange={(v) => setTerrain3D(!!v)}
					/>
				</SettingRow>
				<SettingRow label="Cursor">
					<div className="flex gap-1">
						{(['auto', 'pointer', 'crosshair', 'grab'] as const).map((c) => (
							<Button
								key={c}
								variant={cursor === c ? 'default' : 'ghost'}
								size="sm"
								className="px-1.5 text-[10px]"
								onClick={() => setCursor(c)}
							>
								{c}
							</Button>
						))}
					</div>
				</SettingRow>
			</div>
		</Section>
	);
}

/* ================================================================== */
/*  8. useMapEvents / useMapCursorPosition                           */
/* ================================================================== */

function EventsDemo() {
	const [lastClick, setLastClick] = useState<LngLat | null>(null);
	const [moveCount, setMoveCount] = useState(0);
	const cursorPos = useMapCursorPosition();
	const { mapLoaded } = useMapInstance();

	useMapEvents({
		onClick: (e) => setLastClick(e.lngLat),
		onMoveEnd: () => setMoveCount((c) => c + 1),
	});

	return (
		<Section icon={<MousePointer className="size-3.5" />} title="useMapEvents">
			<div className="grid grid-cols-2 gap-2">
				<Readout
					label="Cursor"
					value={
						cursorPos
							? `${cursorPos.lat.toFixed(4)}°, ${cursorPos.lng.toFixed(4)}°`
							: '—'
					}
				/>
				<Readout
					label="Last click"
					value={
						lastClick
							? `${lastClick.lat.toFixed(4)}°, ${lastClick.lng.toFixed(4)}°`
							: '—'
					}
				/>
				<Readout label="Move events" value={String(moveCount)} />
				<Readout label="Map loaded" value={mapLoaded ? 'Yes' : 'No'} />
			</div>
		</Section>
	);
}

/* ================================================================== */
/*  9. useMapDistance                                                  */
/* ================================================================== */

function DistanceDemo() {
	const { distanceKm, distanceMiles } = useMapDistance();

	const nyc: LngLat = { lng: -74.006, lat: 40.7128 };
	const la: LngLat = { lng: -118.2437, lat: 34.0522 };
	const miami: LngLat = { lng: -80.1918, lat: 25.7617 };

	return (
		<Section icon={<Ruler className="size-3.5" />} title="useMapDistance">
			<div className="flex flex-col gap-1 text-[11px]">
				<span className="opacity-60">
					NYC → LA:{' '}
					<span className="font-mono text-white/80">
						{distanceKm(nyc, la).toFixed(0)} km
					</span>{' '}
					/{' '}
					<span className="font-mono text-white/80">
						{distanceMiles(nyc, la).toFixed(0)} mi
					</span>
				</span>
				<span className="opacity-60">
					NYC → Miami:{' '}
					<span className="font-mono text-white/80">
						{distanceKm(nyc, miami).toFixed(0)} km
					</span>{' '}
					/{' '}
					<span className="font-mono text-white/80">
						{distanceMiles(nyc, miami).toFixed(0)} mi
					</span>
				</span>
			</div>
		</Section>
	);
}

/* ================================================================== */
/*  Shared primitives                                                 */
/* ================================================================== */

function Readout({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-white/6 bg-white/3 px-2.5 py-1.5">
			<div className="text-[9px] uppercase tracking-widest opacity-40">
				{label}
			</div>
			<div className="mt-0.5 font-mono text-xs tabular-nums text-white/80">
				{value}
			</div>
		</div>
	);
}

function SettingRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-[11px] opacity-60">{label}</span>
			{children}
		</div>
	);
}
