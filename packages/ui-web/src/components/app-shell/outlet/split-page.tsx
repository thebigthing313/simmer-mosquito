import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';

/**
 * A two-column stage: a focused, scrolling record column beside a persistent
 * companion surface.
 *
 * In the organization workspace the companion is always a map — `MapSplitPage`
 * is this layout with a `MapCanvas` default — but the geometry of the split is
 * not a map fact. Record forms reach for the same shape, and the operator
 * console needs it without pulling a map renderer into a bundle that has no
 * maps. So the split lives here and the map lives in the app that owns one.
 *
 * The ratio is a fixed 40/60 (content/companion). The right region is
 * `relative` so a caller can layer floating chrome — a detail card, a legend —
 * over whatever it holds.
 *
 * Under a 56rem stage the two columns stop fitting, so the split stacks: the
 * companion draws first as a band capped at 22rem and the content column
 * scrolls beneath it. The question is the stage's width rather than the
 * window's, because the rails beside it take 480px the window query cannot
 * see. The content column is also the `fields` container, which is what a
 * record form's field grids query to decide whether two fields fit side by
 * side.
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
		<div className="@container/split h-full min-h-0 w-full">
			<div
				className={cn(
					'flex h-full min-h-0 w-full flex-col overflow-hidden',
					'@4xl/split:grid @4xl/split:grid-cols-[2fr_3fr]',
					className,
				)}
			>
				<div className="@container/fields min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
				<div
					className={cn(
						'relative order-first h-[min(38svh,22rem)] min-h-0 min-w-0 shrink-0 border-border/40 border-b',
						'@4xl/split:order-none @4xl/split:h-auto @4xl/split:border-b-0 @4xl/split:border-l',
					)}
				>
					{aside}
				</div>
			</div>
		</div>
	);
}
