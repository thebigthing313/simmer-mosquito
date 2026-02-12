import { useCallback, useMemo } from 'react';
import { useMapStore } from '@/src/stores/map-store';
import type { MapLine } from '@/src/stores/map-store';

/**
 * Hook for managing map lines / polylines.
 *
 * @example
 * ```tsx
 * const { addLine, removeLine } = useMapLines();
 * addLine({
 *   id: 'route-1',
 *   coordinates: [[-74, 40.7], [-73.9, 40.8]],
 *   color: '#f59e0b',
 *   width: 3,
 * });
 * ```
 */
export function useMapLines() {
	const linesMap = useMapStore((s) => s.lines);
	const addLine = useMapStore((s) => s.addLine);
	const addLines = useMapStore((s) => s.addLines);
	const updateLine = useMapStore((s) => s.updateLine);
	const removeLine = useMapStore((s) => s.removeLine);
	const removeAllLines = useMapStore((s) => s.removeAllLines);
	const setLineVisibility = useMapStore((s) => s.setLineVisibility);

	const lines = useMemo(() => Array.from(linesMap.values()), [linesMap]);

	const visibleLines = useMemo(
		() => lines.filter((l) => l.visible !== false),
		[lines],
	);

	const getLine = useCallback(
		(id: string): MapLine | undefined => linesMap.get(id),
		[linesMap],
	);

	const setLines = useCallback(
		(newLines: MapLine[]) => {
			removeAllLines();
			addLines(newLines);
		},
		[removeAllLines, addLines],
	);

	return {
		lines,
		visibleLines,
		lineCount: lines.length,
		getLine,
		addLine,
		addLines,
		setLines,
		updateLine,
		removeLine,
		removeAllLines,
		setLineVisibility,
	};
}
