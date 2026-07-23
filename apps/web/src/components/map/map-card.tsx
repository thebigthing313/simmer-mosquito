import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ChevronRightIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

export interface MapCardProps {
	/** A small eyebrow row above the title (e.g. a date with a calendar icon). */
	readonly eyebrow?: ReactNode;
	/** The record's name / heading, top-left. */
	readonly title: ReactNode;
	/** A secondary line under the title (type, date, method…). */
	readonly subtitle?: ReactNode;
	/** Optional status/flag badges, shown as a wrapping row under the header. */
	readonly badges?: ReactNode;
	/** The type-specific body (definition rows, facts, tags…). */
	readonly children?: ReactNode;
	/** Dismiss the card (the top-right exit button). */
	readonly onClose: () => void;
	/**
	 * Renders the standard "View details" footer button. Receives the label +
	 * chevron content so the caller only supplies the typed route wrapper, e.g.
	 * `(content) => <Link to="/…/$id" params={{ id }}>{content}</Link>`.
	 */
	readonly viewDetailLink?: (content: ReactNode) => ReactNode;
	/** Layout-only overrides for the card shell (e.g. a wider `max-w-*`). */
	readonly className?: string;
}

/**
 * The shared floating overlay card for map surfaces: a bottom-centered panel with
 * a title + exit button on top, a type-specific body, and a standard "View
 * details" button at the bottom. Every explorer/detail focus card composes this
 * so the chrome, positioning, motion, and dismiss affordance stay identical;
 * only the body differs per record type (see the `*MapCard` components).
 */
export function MapCard({
	eyebrow,
	title,
	subtitle,
	badges,
	children,
	onClose,
	viewDetailLink,
	className,
}: MapCardProps) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<article
				className={cn(
					'pointer-events-auto w-full max-w-[460px] rounded-lg border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-sm',
					className,
				)}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="grid min-w-0 gap-0.5">
						{eyebrow == null ? null : <div className="min-w-0">{eyebrow}</div>}
						<h2 className="truncate font-semibold text-base text-foreground leading-tight">
							{title}
						</h2>
						{subtitle == null ? null : (
							<p className="m-0 truncate text-muted-foreground text-sm">{subtitle}</p>
						)}
					</div>
					<Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
						<XIcon aria-hidden="true" />
					</Button>
				</div>

				{badges == null ? null : (
					<div className="mt-3 flex flex-wrap items-center gap-1.5">{badges}</div>
				)}

				{children == null ? null : <div className="mt-3">{children}</div>}

				{viewDetailLink == null ? null : (
					<div className="mt-4 flex justify-end">
						<Button asChild size="sm" variant="outline">
							{viewDetailLink(
								<>
									View details
									<ChevronRightIcon aria-hidden="true" />
								</>,
							)}
						</Button>
					</div>
				)}
			</article>
		</div>
	);
}

/**
 * A bordered `<dl>` fact tile for a map card body — the shared replacement for
 * the `DetailFact` that was copy-pasted across the explorer cards. Sits in a
 * `grid grid-cols-2 gap-2 text-xs` facts grid; `wide` spans both columns.
 */
export function MapCardFact({
	label,
	value,
	wide = false,
}: {
	readonly label: string;
	readonly value: ReactNode;
	readonly wide?: boolean;
}) {
	return (
		<div
			className={cn(
				'grid gap-0.5 rounded-md border border-border/40 bg-background/60 px-2.5 py-1.5',
				wide && 'col-span-2',
			)}
		>
			<dt className="font-medium text-[0.68rem] text-muted-foreground uppercase tracking-wide">
				{label}
			</dt>
			<dd className="m-0 min-w-0 truncate font-medium text-foreground">{value}</dd>
		</div>
	);
}

/** The shared "lat, lng" label (4dp) used by the map cards. */
export function coordinateLabel(point: { readonly lat: number; readonly lng: number }): string {
	return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}
