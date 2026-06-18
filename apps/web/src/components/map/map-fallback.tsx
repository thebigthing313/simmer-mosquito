import { iconRegistry, OctagonXIcon } from '@simmer-mosquito/ui-web/icons/registry';

const MapIcon = iconRegistry.domains.gis.icon;

/**
 * Teaching overlay for the two states where the map cannot draw: no configured
 * Mapbox token, or a hard load failure. It explains the cause and the fix rather
 * than leaving an empty grey canvas.
 */
export function MapFallback({
	variant,
	title,
	description,
}: {
	readonly variant: 'empty' | 'error';
	readonly title: string;
	readonly description: string;
}) {
	const Icon = variant === 'error' ? OctagonXIcon : MapIcon;

	return (
		<div className="absolute inset-0 grid place-items-center bg-muted/40 p-6 text-center">
			<div className="max-w-sm">
				<div className="mx-auto grid size-12 place-items-center rounded-full bg-background shadow-sm">
					<Icon
						aria-hidden="true"
						className={
							variant === 'error' ? 'size-5 text-destructive' : 'size-5 text-muted-foreground'
						}
					/>
				</div>
				<h2 className="mt-4 font-semibold text-base text-foreground">{title}</h2>
				<p className="mt-1.5 text-muted-foreground text-sm">{description}</p>
			</div>
		</div>
	);
}
