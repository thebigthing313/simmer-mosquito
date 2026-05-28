import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { MinusIcon, PlusIcon, ScanEyeIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';

export function MapControls({ map }: { readonly map: MapboxMap | null }) {
	return (
		<div className="flex flex-col overflow-hidden rounded-md border bg-background shadow-md">
			<Button
				aria-label="Zoom in"
				className="rounded-none border-b"
				disabled={map === null}
				onClick={() => map?.zoomIn()}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<PlusIcon />
			</Button>
			<Button
				aria-label="Zoom out"
				className="rounded-none border-b"
				disabled={map === null}
				onClick={() => map?.zoomOut()}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<MinusIcon />
			</Button>
			<Button
				aria-label="Reset bearing"
				className="rounded-none"
				disabled={map === null}
				onClick={() => map?.resetNorthPitch()}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<ScanEyeIcon />
			</Button>
		</div>
	);
}
