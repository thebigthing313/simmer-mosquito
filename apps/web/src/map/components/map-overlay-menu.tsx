import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { MapOverlayDefinition, MapOverlayVisibility } from '../types';

const LayersIcon = iconRegistry.domains.gis.icon;

export function MapOverlayMenu({
	overlays,
	setOverlayVisible,
	visibility,
}: {
	readonly overlays: readonly MapOverlayDefinition[];
	readonly setOverlayVisible: (overlayId: string, visible: boolean) => void;
	readonly visibility: MapOverlayVisibility;
}) {
	if (overlays.length === 0) {
		return null;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label="Map layers"
					className="border bg-background shadow-md"
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					<LayersIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel>Overlays</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{overlays.map((overlay) => (
					<DropdownMenuCheckboxItem
						checked={visibility[overlay.id] === true}
						key={overlay.id}
						onCheckedChange={(checked) => setOverlayVisible(overlay.id, checked === true)}
					>
						<span className="flex min-w-0 flex-col">
							<span className="truncate">{overlay.label}</span>
							{overlay.description === undefined ? null : (
								<span className="truncate text-xs text-muted-foreground">
									{overlay.description}
								</span>
							)}
						</span>
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
