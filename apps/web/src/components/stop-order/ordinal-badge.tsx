import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { RouteStopFeature } from '../map/use-route-layer';

/**
 * The tone vocabulary is the map layer's, so a stop's pin and its list badge can
 * never drift apart — one value drives both.
 */
export type StopTone = RouteStopFeature['tone'];

/**
 * The numbered circle marking a stop's place in the sequence.
 *
 * It takes a resolved `tone` rather than the stop itself because what the number
 * should say varies by feature: on a route it reports the site's status, on an
 * assignment it reports progress on the work. Each caller decides; the badge only
 * draws.
 */
export function OrdinalBadge({
	ordinal,
	tone,
}: {
	readonly ordinal: number;
	readonly tone: StopTone;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-[0.72rem] ring-2 ring-background',
				tone === 'inaccessible'
					? 'bg-[var(--danger)] text-white'
					: tone === 'inactive'
						? 'bg-muted-foreground text-background'
						: 'bg-primary text-primary-foreground',
			)}
		>
			{ordinal}
		</span>
	);
}
