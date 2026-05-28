import { useCallback, useMemo, useState } from 'react';
import type { MapOverlayDefinition, MapOverlayVisibility } from '../types';

export interface UseMapOverlaysResult {
	readonly setOverlayVisible: (overlayId: string, visible: boolean) => void;
	readonly toggleOverlay: (overlayId: string) => void;
	readonly visibleOverlays: readonly MapOverlayDefinition[];
	readonly visibility: MapOverlayVisibility;
}

export function useMapOverlays(
	overlays: readonly MapOverlayDefinition[] = [],
): UseMapOverlaysResult {
	const initialVisibility = useMemo(() => getDefaultVisibility(overlays), [overlays]);
	const [visibility, setVisibility] = useState<MapOverlayVisibility>(initialVisibility);

	const setOverlayVisible = useCallback((overlayId: string, visible: boolean) => {
		setVisibility((current) => ({
			...current,
			[overlayId]: visible,
		}));
	}, []);

	const toggleOverlay = useCallback((overlayId: string) => {
		setVisibility((current) => ({
			...current,
			[overlayId]: !(current[overlayId] ?? false),
		}));
	}, []);

	const normalizedVisibility = useMemo(
		() => ({
			...initialVisibility,
			...visibility,
		}),
		[initialVisibility, visibility],
	);

	const visibleOverlays = useMemo(
		() => overlays.filter((overlay) => normalizedVisibility[overlay.id] === true),
		[normalizedVisibility, overlays],
	);

	return {
		setOverlayVisible,
		toggleOverlay,
		visibleOverlays,
		visibility: normalizedVisibility,
	};
}

function getDefaultVisibility(overlays: readonly MapOverlayDefinition[]): MapOverlayVisibility {
	return Object.fromEntries(
		overlays.map((overlay) => [overlay.id, overlay.defaultVisible === true]),
	);
}
