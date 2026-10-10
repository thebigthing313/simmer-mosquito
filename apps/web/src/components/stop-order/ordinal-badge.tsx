import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { RouteStopFeature } from '../../hooks/map/use-route-layer';

/**
 * The tone vocabulary is the map layer's, so a stop's pin and its list badge
 * cannot drift apart: one value drives both.
 *
 * The badge takes one tone the map does not, `resolving`, in
 * {@link OrdinalTone}. A stop is resolving while the record behind it has not
 * streamed in, and until it does the stop has no location, so it never reaches
 * the map and the layer's colour expression would have nothing to draw it on.
 */
export type StopTone = RouteStopFeature['tone'];

/** What the badge draws: a map tone, or `resolving` for a stop the map never gets. */
export type OrdinalTone = StopTone | 'resolving';

/**
 * The resolving tone, an outlined muted circle with no fill. The Trap Route
 * detail page draws its ordinal in a circle of its own and reads this so the
 * state looks the same there.
 */
export const resolvingToneClass =
	'border border-muted-foreground bg-transparent text-muted-foreground';

const toneClass: Readonly<Record<OrdinalTone, string>> = {
	default: 'bg-primary text-primary-foreground',
	inactive: 'bg-muted-foreground text-background',
	inaccessible: 'bg-[var(--danger)] text-white',
	// Blue, not green: `default` already owns the brand green here, and a worked
	// stop next to an unworked one has to be told apart at 24px.
	done: 'bg-[var(--info)] text-white',
	skipped: 'bg-[var(--warning)] text-white',
	resolving: resolvingToneClass,
};

/**
 * The numbered circle marking a stop's place in the sequence.
 *
 * It takes a resolved `tone` rather than the stop itself because what the number
 * should say varies by feature: on a route it reports the site's status, on an
 * assignment it reports progress on the work. Each caller decides; the badge only
 * draws. The tone is also written to `data-tone`.
 */
export function OrdinalBadge({
	ordinal,
	tone,
}: {
	readonly ordinal: number;
	readonly tone: OrdinalTone;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-caption ring-2 ring-background',
				toneClass[tone],
			)}
			data-tone={tone}
		>
			{ordinal}
		</span>
	);
}
