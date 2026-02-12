import { Badge } from '@simmer/ui/components/badge';
import { Button } from '@simmer/ui/components/button';
import { Switch } from '@simmer/ui/components/switch';
import { createFileRoute } from '@tanstack/react-router';
import { Flame, MapPin, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useMapBoundingBox } from '@/src/hooks/use-map-bounding-box';
import { useMapEvents } from '@/src/hooks/use-map-events';
import { useMapMarkers } from '@/src/hooks/use-map-markers';
import { useMapStore } from '@/src/stores/map-store';

export const Route = createFileRoute('/(app)/map-stress-test')({
	beforeLoad: () => ({
		mainOutlet: {
			header: 'Marker Stress Test',
			description: 'Benchmark marker rendering',
		},
	}),
	component: MapStressTestPage,
});

const PRESETS = [100, 500, 1_000, 5_000, 10_000, 25_000] as const;

const COLORS = [
	'#10b981',
	'#f59e0b',
	'#8b5cf6',
	'#ef4444',
	'#3b82f6',
	'#ec4899',
	'#14b8a6',
	'#f97316',
];

function MapStressTestPage() {
	const { bounds } = useMapBoundingBox();
	const { markers, addMarkers, removeAllMarkers, setMarkers } = useMapMarkers();
	const [lastTime, setLastTime] = useState<number | null>(null);
	const [dropping, setDropping] = useState(false);
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [autoCount, setAutoCount] = useState(500);
	const counterRef = useRef(0);
	const autoCountRef = useRef(autoCount);
	autoCountRef.current = autoCount;

	const generateMarkers = useCallback(
		(count: number, replace: boolean) => {
			const currentBounds = useMapStore.getState().bounds;
			if (!currentBounds) return;

			const t0 = performance.now();

			const sw = currentBounds.sw;
			const ne = currentBounds.ne;
			const lngSpan = ne.lng - sw.lng;
			const latSpan = ne.lat - sw.lat;

			if (replace) counterRef.current = 0;

			const batch = Array.from({ length: count }, (_, i) => {
				counterRef.current++;
				return {
					id: `stress-${counterRef.current}`,
					lngLat: {
						lng: sw.lng + Math.random() * lngSpan,
						lat: sw.lat + Math.random() * latSpan,
					},
					color: COLORS[i % COLORS.length],
				};
			});

			if (replace) {
				setMarkers(batch);
			} else {
				addMarkers(batch);
			}

			const elapsed = performance.now() - t0;
			setLastTime(elapsed);
		},
		[addMarkers, setMarkers],
	);

	const dropMarkers = useCallback(
		(count: number) => {
			if (!bounds) return;
			setDropping(true);
			requestAnimationFrame(() => {
				generateMarkers(count, false);
				setDropping(false);
			});
		},
		[bounds, generateMarkers],
	);

	// Regenerate markers on every map move when auto-refresh is on
	useMapEvents({
		onMoveEnd: useCallback(() => {
			if (!autoRefresh) return;
			generateMarkers(autoCountRef.current, true);
		}, [autoRefresh, generateMarkers]),
	});

	const clearAll = useCallback(() => {
		counterRef.current = 0;
		setLastTime(null);
		removeAllMarkers();
	}, [removeAllMarkers]);

	return (
		<div className="flex flex-col gap-5">
			{/* Header */}
			<div className="flex items-center gap-2">
				<Flame className="size-4 text-simmer-red" />
				<h3 className="font-semibold text-xs uppercase tracking-widest opacity-60">
					Drop random markers
				</h3>
			</div>

			{/* Status */}
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline" className="text-[10px]">
					<MapPin className="mr-1 size-2.5" />
					{markers.length.toLocaleString()} markers
				</Badge>
				{lastTime !== null && (
					<Badge variant="outline" className="text-[10px] text-simmer-green">
						{lastTime < 1
							? `${lastTime.toFixed(2)} ms`
							: `${lastTime.toFixed(0)} ms`}
					</Badge>
				)}
				{!bounds && (
					<span className="text-[10px] text-simmer-yellow opacity-70">
						Waiting for bounds…
					</span>
				)}
			</div>

			{/* Auto-refresh on move */}
			<div className="flex flex-col gap-2 rounded-md border border-white/6 bg-white/3 p-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<RefreshCw className={`size-3 ${autoRefresh ? 'text-simmer-green animate-spin' : 'opacity-40'}`} />
						<span className="text-[11px] opacity-70">Auto-refresh on move</span>
					</div>
					<Switch
						checked={autoRefresh}
						onCheckedChange={(v) => setAutoRefresh(!!v)}
					/>
				</div>
				{autoRefresh && (
					<div className="grid grid-cols-3 gap-1">
						{([100, 500, 1_000, 5_000] as const).map((n) => (
							<Button
								key={n}
								variant={autoCount === n ? 'default' : 'ghost'}
								size="sm"
								className="text-[10px]"
								onClick={() => setAutoCount(n)}
							>
								{n.toLocaleString()}
							</Button>
						))}
					</div>
				)}
			</div>

			{/* Preset buttons */}
			<div className="grid grid-cols-3 gap-1.5">
				{PRESETS.map((n) => (
					<Button
						key={n}
						variant="outline"
						size="sm"
						className="text-[11px]"
						disabled={!bounds || dropping}
						onClick={() => dropMarkers(n)}
					>
						+{n.toLocaleString()}
					</Button>
				))}
			</div>

			{/* Clear button */}
			<Button
				variant="outline"
				size="sm"
				className="w-full text-[11px]"
				disabled={markers.length === 0}
				onClick={clearAll}
			>
				<Trash2 className="mr-1 size-3" />
				Clear all markers
			</Button>
		</div>
	);
}
