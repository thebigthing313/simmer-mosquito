import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';

/**
 * A two-column stage: a focused, scrolling record column beside a persistent
 * companion surface.
 *
 * In the agency workspace the companion is always a map — `MapSplitPage` is this
 * layout with a `MapCanvas` default — but the geometry of the split is not a map
 * fact. Record forms reach for the same shape, and the operator console needs it
 * without pulling a map renderer into a bundle that has no maps. So the split
 * lives here and the map lives in the app that owns one.
 *
 * The ratio is a fixed 40/60 (content/companion). The right region is
 * `relative` so a caller can layer floating chrome — a detail card, a legend —
 * over whatever it holds.
 */
export function SplitPage({
	children,
	className,
	aside,
}: {
	readonly children: React.ReactNode;
	readonly className?: string | undefined;
	/** The right-half surface. Rendered as given; no default. */
	readonly aside: React.ReactNode;
}) {
	return (
		<div
			className={cn('grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden', className)}
		>
			<div className="min-h-0 min-w-0 overflow-y-auto">{children}</div>
			<div className="relative min-h-0 min-w-0 border-border/40 border-l">{aside}</div>
		</div>
	);
}
