import { boundsFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	CheckIcon,
	Loader2Icon,
	MapPinnedIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import type { DrawGeometry } from '../../components/map/use-map-draw';

// Presentational pieces every control-action form shares. Each form owns its own
// fields and `useAppForm` instance; only the chrome around them lives here.

export function FormSection({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<section className="grid gap-4">
			<h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
			{children}
		</section>
	);
}

export function MapPrompt({ children }: { readonly children: React.ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in">
			<p className="m-0 inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/95 px-3 py-2 text-foreground text-sm shadow-lg backdrop-blur-sm">
				{children}
			</p>
		</div>
	);
}

/**
 * Place / refine / clear the action's point. Every performed control action stores
 * its own geometry, so the point is required on create.
 */
export function PointControl({
	geometry,
	isDrawing,
	canMoveToAddress,
	onRequestPoint,
	onMoveToAddress,
	onClear,
}: {
	readonly geometry: DrawGeometry | null;
	readonly isDrawing: boolean;
	readonly canMoveToAddress: boolean;
	readonly onRequestPoint: () => void;
	readonly onMoveToAddress: () => void;
	readonly onClear: () => void;
}) {
	return (
		<div className="grid gap-2 rounded-md border border-border/40 bg-background/70 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2">
					<MapPinnedIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
					<div className="grid min-w-0 gap-0.5">
						<span className="font-medium text-foreground text-sm">Point (required)</span>
						<p className="m-0 min-w-0 text-muted-foreground text-xs">
							{geometry === null ? 'No point placed yet.' : pointSummary(geometry)}
						</p>
					</div>
				</div>
				{geometry === null ? (
					<Badge tone="neutral" variant="outline">
						Not set
					</Badge>
				) : (
					<Badge tone="success" variant="outline">
						<CheckIcon aria-hidden="true" />
						Placed
					</Badge>
				)}
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={isDrawing}
					onClick={onRequestPoint}
					size="sm"
					type="button"
					variant={geometry === null ? 'default' : 'outline'}
				>
					{isDrawing ? (
						<Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
					) : (
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
					)}
					{geometry === null ? 'Drop Point' : 'Refine Point'}
				</Button>
				{canMoveToAddress ? (
					<Button onClick={onMoveToAddress} size="sm" type="button" variant="ghost">
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
						Move to Address
					</Button>
				) : null}
				{geometry === null ? null : (
					<Button onClick={onClear} size="sm" type="button" variant="ghost">
						<XIcon aria-hidden="true" data-icon="inline-start" />
						Clear
					</Button>
				)}
			</div>
		</div>
	);
}

export function pointSummary(geometry: DrawGeometry): string {
	if (geometry.type !== 'Point') {
		return 'Point placed';
	}
	const coordinates = geometry.coordinates;
	if (!Array.isArray(coordinates) || coordinates.length < 2) {
		return 'Point placed';
	}
	return `Point · ${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
}

export function useFitToGeometry(map: MapboxMap | null, geometry: GeoJsonGeometry | null): void {
	const lastFitRef = useRef<string | null>(null);
	useEffect(() => {
		if (map === null || geometry === null) {
			return;
		}
		const signature = JSON.stringify(geometry);
		if (lastFitRef.current === signature) {
			return;
		}
		lastFitRef.current = signature;

		const bounds = boundsFromGeoJson(geometry);
		if (bounds === null) {
			return;
		}
		const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
		if (hasArea) {
			map.fitBounds(
				[
					[bounds.west, bounds.south],
					[bounds.east, bounds.north],
				],
				{ padding: 80, maxZoom: 17, duration: 600 },
			);
		} else {
			map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15) });
		}
	}, [map, geometry]);
}

/** Trim a form text value down to the nullable column it maps to. */
export function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
