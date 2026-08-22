import { formatGeometryTypeLabel, isPointGeomType } from '@simmer-mosquito/mapping';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	CalendarIcon,
	ChevronRightIcon,
	LocateFixedIcon,
	type RegistryIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import { type MapInset, NO_MAP_INSET } from './map-inset';

export interface MapCardProps {
	/** A small eyebrow row above the title (e.g. a date with a calendar icon). */
	readonly eyebrow?: ReactNode;
	/** The record's name / heading, top-left. */
	readonly title: ReactNode;
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
	/**
	 * What else is floating over this map. The card centres in the room that is
	 * left, so a full-page map with a results panel does not centre the card half
	 * underneath it.
	 */
	readonly inset?: MapInset | undefined;
}

/** Gap (px) between the card and the map edge, matching the `*-4` it replaced. */
const CARD_EDGE = 16;

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
	badges,
	children,
	onClose,
	viewDetailLink,
	className,
	inset,
}: MapCardProps) {
	const clear = inset ?? NO_MAP_INSET;
	return (
		<div
			className="pointer-events-none absolute z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
			style={{
				left: CARD_EDGE + clear.left,
				right: CARD_EDGE + clear.right,
				bottom: CARD_EDGE + clear.bottom,
			}}
		>
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
									View Details
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
 * One stacked detail row in a map card body: a leading icon and its value, in the
 * muted "[icon] value" form the service-request card uses. Group several inside a
 * `grid gap-1.5`. Pass `mono` for coordinates/codes/IDs (per the design system,
 * the only place the mono stack is used).
 */
export function MapCardDetail({
	icon: Icon,
	mono = false,
	children,
}: {
	readonly icon: RegistryIcon;
	readonly mono?: boolean;
	readonly children: ReactNode;
}) {
	return (
		<div className="flex items-start gap-1.5 text-muted-foreground text-sm">
			<Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
			<span className={cn('min-w-0 leading-snug', mono && 'font-mono text-[0.8rem]')}>
				{children}
			</span>
		</div>
	);
}

/**
 * The long free-text block at the bottom of a map card (a request's details, a
 * habitat/region description). Sits under the stacked details, foreground-weighted
 * for emphasis; `divided` (default) draws the separator rule above it — turn it off
 * when the text is the card's only body content.
 */
export function MapCardText({
	children,
	divided = true,
}: {
	readonly children: ReactNode;
	readonly divided?: boolean;
}) {
	return (
		<p
			className={cn(
				'm-0 line-clamp-3 whitespace-pre-wrap text-foreground text-sm leading-snug',
				divided && 'border-border/50 border-t pt-2.5',
			)}
		>
			{children}
		</p>
	);
}

/** The shared "lat, lng" label (4dp) used by the map cards. */
export function coordinateLabel(point: { readonly lat: number; readonly lng: number }): string {
	return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

/**
 * The location row of a map card: the centroid, plus the record's stored geometry
 * type when it is not a point.
 *
 * Map cards deliberately stay centroid-based — a card is a compact readout, and a
 * coordinate is what a crew acts on. But a record that stores a line or polygon
 * must not *read* as a point, so the shape is named alongside the coordinate and
 * the coordinate is marked as its center. Points show the coordinate alone, since
 * there the centroid is the geometry.
 *
 * The stored type comes straight off the synced row's `geomType` (Electric carries
 * it), so this costs no extra fetch. See {@link RecordLocationCard} for the detail
 * pages, which render the real shape.
 */
export function MapCardLocation({
	lat,
	lng,
	geomType,
}: {
	readonly lat: number | null | undefined;
	readonly lng: number | null | undefined;
	readonly geomType: string | null | undefined;
}) {
	if (typeof lat !== 'number' || typeof lng !== 'number') {
		return <MapCardDetail icon={LocateFixedIcon}>Unknown coordinates</MapCardDetail>;
	}

	const coordinates = coordinateLabel({ lat, lng });
	if (isPointGeomType(geomType)) {
		return (
			<MapCardDetail icon={LocateFixedIcon} mono>
				{coordinates}
			</MapCardDetail>
		);
	}

	return (
		<MapCardDetail icon={LocateFixedIcon}>
			<span className="font-medium text-foreground">{formatGeometryTypeLabel(geomType ?? '')}</span>{' '}
			<span className="font-mono text-[0.8rem]">{coordinates}</span>{' '}
			<span className="text-muted-foreground/80">center</span>
		</MapCardDetail>
	);
}

/**
 * The eyebrow row at the top of a {@link MapCard}: the record's `type` (e.g.
 * "Inspection"), plus its `date` for dated records. Every card passes its type so
 * the kind of feature you clicked always reads at a glance; inspections, samples,
 * collections, applications, source-reduction, biocontrol, and service requests
 * additionally pass `date`, which appears with a calendar icon after the type.
 */
export function MapCardEyebrow({
	type,
	date,
}: {
	readonly type: string;
	readonly date?: string | undefined;
}) {
	return (
		<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
			<span className="font-semibold text-[0.68rem] text-foreground/75 uppercase tracking-wide">
				{type}
			</span>
			{date === undefined ? null : (
				<>
					<span aria-hidden="true" className="text-muted-foreground/40">
						·
					</span>
					<span className="flex items-center gap-1 tabular-nums">
						<CalendarIcon aria-hidden="true" className="size-3.5" />
						{formatMapCardDate(date)}
					</span>
				</>
			)}
		</div>
	);
}

/**
 * `July 24, 2026` — the canonical map-card date label. Date-only columns arrive as
 * `YYYY-MM-DD`; format in UTC so the calendar day never shifts across timezones.
 */
export function formatMapCardDate(date: string): string {
	const parts = date.slice(0, 10).split('-');
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (!(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))) {
		return date;
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(year, month - 1, day)));
}
