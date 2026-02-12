import { useEffect, useState } from 'react';
import { useMapStore } from '@/src/stores/map-store';

/**
 * Branded map attribution badge — replaces the default Mapbox attribution
 * with a compact, on-brand label.
 */
export function MapAttribution() {
	const mapLoaded = useMapStore((s) => s.mapLoaded);

	if (!mapLoaded) return null;

	return (
		<div className="absolute right-4 bottom-2 z-40">
			<a
				href="https://www.mapbox.com/"
				target="_blank"
				rel="noopener noreferrer"
				className="text-[9px] text-white/30 transition-colors hover:text-white/60"
			>
				© Mapbox © OpenStreetMap
			</a>
		</div>
	);
}

/**
 * Visual scale bar that automatically matches the current zoom level.
 */
export function MapScaleBar() {
	const map = useMapStore((s) => s.map);
	const mapLoaded = useMapStore((s) => s.mapLoaded);
	const zoom = useMapStore((s) => s.zoom);
	const center = useMapStore((s) => s.center);

	const [scale, setScale] = useState<{ distance: string; width: number } | null>(null);

	useEffect(() => {
		if (!map || !mapLoaded) return;

		const calculate = () => {
			const y = map.getContainer().clientHeight / 2;
			const maxBarWidth = 100; // px

			const left = map.unproject([0, y]);
			const right = map.unproject([maxBarWidth, y]);

			const R = 6371e3;
			const toRad = (d: number) => (d * Math.PI) / 180;
			const dLat = toRad(right.lat - left.lat);
			const dLng = toRad(right.lng - left.lng);
			const a =
				Math.sin(dLat / 2) ** 2 +
				Math.cos(toRad(left.lat)) *
					Math.cos(toRad(right.lat)) *
					Math.sin(dLng / 2) ** 2;
			const metres = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

			// Pick a nice round number
			const niceMetres = [
				1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000,
				20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000,
			];

			let best = niceMetres[0];
			for (const n of niceMetres) {
				if (n <= metres) best = n;
				else break;
			}

			const ratio = best / metres;
			const barWidth = Math.round(maxBarWidth * ratio);

			const label =
				best >= 1000 ? `${best / 1000} km` : `${best} m`;

			setScale({ distance: label, width: barWidth });
		};

		calculate();
		map.on('moveend', calculate);
		map.on('zoomend', calculate);

		return () => {
			map.off('moveend', calculate);
			map.off('zoomend', calculate);
		};
	}, [map, mapLoaded, zoom, center]);

	if (!scale) return null;

	return (
		<div className="absolute bottom-3 left-4 z-40 flex flex-col items-start gap-0.5">
			<span className="font-mono text-[9px] text-white/40 tabular-nums tracking-wider">
				{scale.distance}
			</span>
			<div
				className="h-0.5 rounded-full bg-white/30"
				style={{ width: scale.width }}
			/>
		</div>
	);
}
