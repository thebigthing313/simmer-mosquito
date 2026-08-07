import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/context-menu';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useNavigate } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useHasRole } from '../../hooks/use-can-write';
import type { MapCreateTarget } from './map-create-targets';
import { formatLatLng } from './map-point-search';

const CopyIcon = iconRegistry.actions.copy.icon;
const AddIcon = iconRegistry.actions.add.icon;

export interface MapContextMenuConfig {
	/**
	 * Records this map offers to start at the clicked point, in menu order. An
	 * empty list leaves the menu with the coordinate actions alone, which is
	 * still worth having on a read-only surface.
	 */
	readonly create?: readonly MapCreateTarget[];
}

/**
 * The map's right-click menu: where you clicked, and what you can start there.
 *
 * A point on a map is the one piece of information a map has that no list view
 * does, and until now it was unreachable — an operator who spotted standing
 * water at a corner had to open a form and re-find the same corner by drawing.
 * The menu closes that: the coordinate goes to the clipboard, or straight into a
 * new record's geometry.
 *
 * Actions above the operator's role are omitted rather than disabled, matching
 * `useHasRole` — and if that empties the list, only the coordinate remains.
 */
export function MapContextMenu({
	map,
	config,
	children,
}: {
	readonly map: MapboxMap | null;
	readonly config: MapContextMenuConfig | undefined;
	readonly children: ReactNode;
}) {
	const [point, setPoint] = useState<{ readonly lat: number; readonly lng: number } | null>(null);
	const [surface, setSurface] = useState<HTMLDivElement | null>(null);

	/**
	 * Take the right-click before Mapbox does, then hand Radix a fresh one.
	 *
	 * Mapbox GL calls `preventDefault()` on `contextmenu` at its own container,
	 * which sits between the canvas and this element. Radix's trigger runs its
	 * open handler through `composeEventHandlers`, which skips an event that is
	 * already default-prevented — so left alone, the menu never opens at all, and
	 * nothing anywhere reports an error.
	 *
	 * A React `onContextMenu` cannot fix it: React listens at the root, so its
	 * handlers run only after the native event has finished bubbling past Mapbox.
	 * This is a native listener in the *capture* phase, which is the one place
	 * ahead of Mapbox. It suppresses the browser's own menu, keeps the event away
	 * from the GL container, resolves the coordinate while the click is still
	 * live, and re-emits a clean event for Radix to position against.
	 */
	useEffect(() => {
		if (surface === null || map === null) {
			return;
		}
		const onNativeContextMenu = (event: MouseEvent) => {
			// The re-emitted event reaches this same listener in the target phase.
			if (!event.isTrusted) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();

			const rect = surface.getBoundingClientRect();
			const lngLat = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
			setPoint({ lat: lngLat.lat, lng: lngLat.lng });

			surface.dispatchEvent(
				new MouseEvent('contextmenu', {
					bubbles: true,
					cancelable: true,
					clientX: event.clientX,
					clientY: event.clientY,
				}),
			);
		};
		surface.addEventListener('contextmenu', onNativeContextMenu, true);
		return () => surface.removeEventListener('contextmenu', onNativeContextMenu, true);
	}, [surface, map]);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild disabled={map === null}>
				<div className="absolute inset-0 size-full" ref={setSurface}>
					{children}
				</div>
			</ContextMenuTrigger>
			{point === null ? null : (
				<MapContextMenuItems config={config} lat={point.lat} lng={point.lng} />
			)}
		</ContextMenu>
	);
}

function MapContextMenuItems({
	config,
	lat,
	lng,
}: {
	readonly config: MapContextMenuConfig | undefined;
	readonly lat: number;
	readonly lng: number;
}) {
	const navigate = useNavigate();
	const coordinates = formatLatLng(lat, lng);

	const onCopy = useCallback(() => {
		// `writeText` rejects without a secure context or clipboard permission, and
		// a menu that closes having silently done nothing is worse than one that
		// says so.
		navigator.clipboard.writeText(coordinates).then(
			() => toast.success('Coordinates copied', { description: coordinates }),
			() => toast.error('Could not copy the coordinates to the clipboard.'),
		);
	}, [coordinates]);

	return (
		<ContextMenuContent className="w-60">
			<ContextMenuLabel className="font-normal text-muted-foreground text-xs tabular-nums">
				{coordinates}
			</ContextMenuLabel>
			<ContextMenuItem onSelect={onCopy}>
				<CopyIcon aria-hidden="true" />
				Copy coordinates
			</ContextMenuItem>
			<MapCreateItems
				onSelect={(to) => {
					void navigate({ to, search: { lat, lng } });
				}}
				targets={config?.create ?? []}
			/>
		</ContextMenuContent>
	);
}

/**
 * The create half of the menu, separated so the hook that reads the operator's
 * role is called once per target rather than conditionally.
 */
function MapCreateItems({
	targets,
	onSelect,
}: {
	readonly targets: readonly MapCreateTarget[];
	readonly onSelect: (to: string) => void;
}) {
	if (targets.length === 0) {
		return null;
	}
	return (
		<>
			<ContextMenuSeparator />
			{targets.map((target) => (
				<MapCreateItem key={target.id} onSelect={onSelect} target={target} />
			))}
		</>
	);
}

function MapCreateItem({
	target,
	onSelect,
}: {
	readonly target: MapCreateTarget;
	readonly onSelect: (to: string) => void;
}) {
	const allowed = useHasRole(target.minimumRole);
	if (!allowed) {
		return null;
	}
	return (
		<ContextMenuItem onSelect={() => onSelect(target.to)}>
			<AddIcon aria-hidden="true" />
			{target.label}
		</ContextMenuItem>
	);
}
