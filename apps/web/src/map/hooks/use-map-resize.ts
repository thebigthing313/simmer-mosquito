import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';

export function useMapResize(map: MapboxMap | null, container: HTMLElement | null): void {
	useEffect(() => {
		if (map === null || container === null) {
			return;
		}

		const resize = () => {
			map.resize();
		};
		const frameIds: number[] = [];
		frameIds.push(requestAnimationFrame(resize));
		frameIds.push(
			requestAnimationFrame(() => {
				frameIds.push(requestAnimationFrame(resize));
			}),
		);
		const observer = new ResizeObserver(() => {
			resize();
		});
		observer.observe(container);

		return () => {
			for (const frameId of frameIds) {
				cancelAnimationFrame(frameId);
			}
			observer.disconnect();
		};
	}, [container, map]);
}
