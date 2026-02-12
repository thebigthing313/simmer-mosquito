import {
	Compass,
	Locate,
	Minus,
	Mountain,
	Plus,
	RotateCcw,
} from 'lucide-react';
import { useCallback } from 'react';
import { useMapStore } from '@/src/stores/map-store';

/**
 * Custom map navigation controls that replace the default Mapbox
 * NavigationControl + GeolocateControl with on-brand glassmorphic buttons.
 *
 * Positioned bottom-right by default (same spot the native controls lived).
 */
export function MapControls() {
	const map = useMapStore((s) => s.map);
	const mapLoaded = useMapStore((s) => s.mapLoaded);
	const zoom = useMapStore((s) => s.zoom);
	const bearing = useMapStore((s) => s.bearing);
	const pitch = useMapStore((s) => s.pitch);
	const terrain3D = useMapStore((s) => s.terrain3D);
	const setTerrain3D = useMapStore((s) => s.setTerrain3D);

	const handleZoomIn = useCallback(() => {
		map?.zoomIn({ duration: 300 });
	}, [map]);

	const handleZoomOut = useCallback(() => {
		map?.zoomOut({ duration: 300 });
	}, [map]);

	const handleResetNorth = useCallback(() => {
		map?.resetNorth({ duration: 600 });
	}, [map]);

	const handleResetPitch = useCallback(() => {
		map?.easeTo({ pitch: 0, duration: 600 });
	}, [map]);

	const handleLocate = useCallback(() => {
		if (!map) return;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				map.flyTo({
					center: [pos.coords.longitude, pos.coords.latitude],
					zoom: 14,
					duration: 2000,
				});
			},
			(err) => console.warn('Geolocation error:', err),
		);
	}, [map]);

	const handleToggleTerrain = useCallback(() => {
		setTerrain3D(!terrain3D);
	}, [setTerrain3D, terrain3D]);

	if (!mapLoaded) return null;

	return (
		<div className="absolute right-4 bottom-10 z-40 flex flex-col items-center gap-1">
			{/* ── Zoom ── */}
			<ControlGroup>
				<ControlButton
					onClick={handleZoomIn}
					label="Zoom in"
					disabled={zoom >= 22}
				>
					<Plus className="size-3.5" />
				</ControlButton>
				<GroupDivider />
				<ControlButton
					onClick={handleZoomOut}
					label="Zoom out"
					disabled={zoom <= 0}
				>
					<Minus className="size-3.5" />
				</ControlButton>
			</ControlGroup>

			{/* ── Compass / bearing ── */}
			<ControlGroup>
				<ControlButton
					onClick={handleResetNorth}
					label="Reset north"
					active={bearing !== 0}
				>
					<Compass
						className="size-3.5 transition-transform duration-300"
						style={{ transform: `rotate(${-bearing}deg)` }}
					/>
				</ControlButton>
			</ControlGroup>

			{/* ── Pitch reset ── */}
			{pitch !== 0 && (
				<ControlGroup>
					<ControlButton onClick={handleResetPitch} label="Reset pitch">
						<RotateCcw className="size-3.5" />
					</ControlButton>
				</ControlGroup>
			)}

			{/* ── 3-D terrain ── */}
			<ControlGroup>
				<ControlButton
					onClick={handleToggleTerrain}
					label={terrain3D ? 'Disable 3D terrain' : 'Enable 3D terrain'}
					active={terrain3D}
				>
					<Mountain className="size-3.5" />
				</ControlButton>
			</ControlGroup>

			{/* ── Geolocate ── */}
			<ControlGroup>
				<ControlButton onClick={handleLocate} label="Go to my location">
					<Locate className="size-3.5" />
				</ControlButton>
			</ControlGroup>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Primitives                                                        */
/* ------------------------------------------------------------------ */

function ControlGroup({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900/60 shadow-lg backdrop-blur-xl">
			{children}
		</div>
	);
}

function GroupDivider() {
	return <div className="h-px w-full bg-white/8" />;
}

function ControlButton({
	children,
	onClick,
	label,
	active = false,
	disabled = false,
}: {
	children: React.ReactNode;
	onClick: () => void;
	label: string;
	active?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={onClick}
			disabled={disabled}
			className={[
				'flex size-8 items-center justify-center transition-colors duration-150',
				'text-white/70 hover:bg-white/10 hover:text-white',
				'disabled:pointer-events-none disabled:opacity-30',
				active && 'text-simmer-green',
			]
				.filter(Boolean)
				.join(' ')}
		>
			{children}
		</button>
	);
}
