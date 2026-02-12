import { Layers } from 'lucide-react';
import { useState } from 'react';
import { useMapStore } from '@/src/stores/map-store';
import type { MapStyle } from '@/src/stores/map-store';

const STYLES: { id: MapStyle; label: string; icon: string }[] = [
	{ id: 'mapbox://styles/mapbox/dark-v11', label: 'Dark', icon: '🌑' },
	{ id: 'mapbox://styles/mapbox/light-v11', label: 'Light', icon: '☀️' },
	{ id: 'mapbox://styles/mapbox/streets-v12', label: 'Streets', icon: '🛣️' },
	{ id: 'mapbox://styles/mapbox/outdoors-v12', label: 'Outdoors', icon: '🏕️' },
	{ id: 'mapbox://styles/mapbox/satellite-v9', label: 'Satellite', icon: '🛰️' },
	{ id: 'mapbox://styles/mapbox/satellite-streets-v12', label: 'Hybrid', icon: '🗺️' },
];

/**
 * Glassmorphic map style picker — sits in the bottom-left above the scale bar.
 */
export function MapStyleSwitcher() {
	const mapLoaded = useMapStore((s) => s.mapLoaded);
	const style = useMapStore((s) => s.style);
	const setStyle = useMapStore((s) => s.setStyle);
	const [open, setOpen] = useState(false);

	if (!mapLoaded) return null;

	return (
		<div className="absolute bottom-10 left-4 z-40">
			{/* Flyout menu */}
			{open && (
				<div className="mb-1 flex flex-col gap-0.5 rounded-lg border border-white/10 bg-zinc-900/70 p-1 shadow-xl backdrop-blur-xl">
					{STYLES.map((s) => (
						<button
							key={s.id}
							type="button"
							onClick={() => {
								setStyle(s.id);
								setOpen(false);
							}}
							className={[
								'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
								s.id === style
									? 'bg-white/10 text-white'
									: 'text-white/60 hover:bg-white/5 hover:text-white/80',
							].join(' ')}
						>
							<span className="text-sm">{s.icon}</span>
							<span>{s.label}</span>
						</button>
					))}
				</div>
			)}

			{/* Toggle button */}
			<button
				type="button"
				title="Map style"
				aria-label="Map style"
				onClick={() => setOpen((v) => !v)}
				className={[
					'flex size-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/60 shadow-lg backdrop-blur-xl transition-colors duration-150',
					'text-white/70 hover:bg-white/10 hover:text-white',
					open && 'bg-white/10 text-white',
				]
					.filter(Boolean)
					.join(' ')}
			>
				<Layers className="size-3.5" />
			</button>
		</div>
	);
}
