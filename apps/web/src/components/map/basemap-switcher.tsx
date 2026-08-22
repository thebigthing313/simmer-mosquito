import { iconRegistry, SatelliteIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { MAP_CHROME_SURFACE } from './chrome';
import { BASEMAP_STYLES, type BasemapId } from './map-styles';

const StreetsIcon = iconRegistry.domains.gis.icon;

/**
 * Segmented control for the two basemaps we expose today (Streets, Satellite).
 * Controlled by the map surface so the choice flows straight into the GL style.
 * Labels collapse to icons on narrow viewports to stay out of the map's way.
 */
export function BasemapSwitcher({
	value,
	onChange,
}: {
	readonly value: BasemapId;
	readonly onChange: (id: BasemapId) => void;
}) {
	return (
		<fieldset
			aria-label="Base map style"
			className={cn(
				'flex min-w-0 items-center gap-0.5 rounded-lg p-0.5 shadow-md',
				MAP_CHROME_SURFACE,
			)}
		>
			{BASEMAP_STYLES.map((style) => {
				const Icon = style.id === 'satellite' ? SatelliteIcon : StreetsIcon;
				const active = style.id === value;
				return (
					<button
						aria-pressed={active}
						className={cn(
							'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							active
								? 'bg-primary text-primary-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
						)}
						key={style.id}
						onClick={() => onChange(style.id)}
						type="button"
					>
						<Icon aria-hidden="true" className="size-4" />
						<span className="max-sm:hidden">{style.label}</span>
					</button>
				);
			})}
		</fieldset>
	);
}
