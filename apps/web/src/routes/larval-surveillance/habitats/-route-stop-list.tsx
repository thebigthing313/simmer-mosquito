import type { HabitatTypeRow, TagItemRow, TagRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	AlertTriangleIcon,
	ChevronRightIcon,
	CircleIcon,
	MapPinnedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { and, eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { type CSSProperties, type ReactNode, useMemo } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { type RouteStopCluster, type RouteStopView, stopTone } from './-route-data';

// `tag_items` is on-demand; keep this route's habitat tags warm briefly on unmount.
const tagItemsGcTimeMs = 30_000;
const NO_TAGS: readonly TagRow[] = [];

interface RouteStopListProps {
	readonly clusters: readonly RouteStopCluster[];
	readonly selectedId?: string | null;
	readonly onSelect?: ((id: string | null) => void) | undefined;
	readonly onHover?: ((id: string | null) => void) | undefined;
}

/**
 * The read-only route itinerary: numbered stops in order, with consecutive stops
 * at one address drawn as a single grouped cluster. Each stop shows its habitat's
 * type and tags. Hovering or selecting a stop drives the map through the handlers.
 */
export function RouteStopList({ clusters, selectedId, onSelect, onHover }: RouteStopListProps) {
	const allStops = useMemo(() => clusters.flatMap((cluster) => cluster.stops), [clusters]);
	const { typeNameById, tagsByHabitatId } = useStopMeta(allStops);

	const renderStop = (stop: RouteStopView, grouped: boolean) => (
		<StopRow
			grouped={grouped}
			key={stop.routeItemId}
			onHover={onHover}
			onSelect={onSelect}
			selectedId={selectedId ?? null}
			stop={stop}
			tags={tagsByHabitatId.get(stop.habitatId) ?? NO_TAGS}
			typeName={stop.habitatTypeId === null ? null : (typeNameById.get(stop.habitatTypeId) ?? null)}
		/>
	);

	return (
		<ol className="grid gap-2 p-3">
			{clusters.map((cluster) =>
				cluster.stops.length > 1 ? (
					<AddressCluster cluster={cluster} key={cluster.key} renderStop={renderStop} />
				) : (
					renderStop(cluster.stops[0] as RouteStopView, false)
				),
			)}
		</ol>
	);
}

/**
 * Resolve the habitat type name and tags for a set of route stops. Type names come
 * from the eager `habitat_types` collection; tags from the on-demand `tag_items`
 * collection joined to eager `tags`. Shared by the read-only and edit stop lists.
 */
export function useStopMeta(stops: readonly RouteStopView[]): {
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly tagsByHabitatId: ReadonlyMap<string, readonly TagRow[]>;
} {
	const { rows: habitatTypes } = useCollectionRows<HabitatTypeRow>(webCollections.habitatTypes);
	const { rows: tags } = useCollectionRows<TagRow>(webCollections.tags);

	const typeNameById = useMemo(
		() => new Map(habitatTypes.map((type) => [type.id, type.name])),
		[habitatTypes],
	);
	const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

	const habitatIds = useMemo(() => {
		const ids = new Set<string>();
		for (const stop of stops) {
			ids.add(stop.habitatId);
		}
		return [...ids];
	}, [stops]);
	// A sentinel keeps the IN predicate valid (and matching nothing) with no stops.
	const queryIds = habitatIds.length > 0 ? habitatIds : ['00000000-0000-0000-0000-000000000000'];
	const idsKey = habitatIds.join(',');

	const tagItemsResult = useLiveQuery(
		{
			gcTime: tagItemsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.tagItems })
					.where(({ item }) =>
						and(eq(item.entityType, 'habitat'), inArray(item.entityId, queryIds)),
					),
		},
		[idsKey],
	);

	const tagsByHabitatId = useMemo(() => {
		const map = new Map<string, TagRow[]>();
		for (const item of (tagItemsResult.data ?? []) as readonly TagItemRow[]) {
			const tag = tagById.get(item.tagId);
			if (tag === undefined) {
				continue;
			}
			const list = map.get(item.entityId) ?? [];
			if (!list.some((existing) => existing.id === tag.id)) {
				list.push(tag);
			}
			map.set(item.entityId, list);
		}
		for (const list of map.values()) {
			list.sort((first, second) => first.tagName.localeCompare(second.tagName));
		}
		return map;
	}, [tagItemsResult.data, tagById]);

	return { typeNameById, tagsByHabitatId };
}

function AddressCluster({
	cluster,
	renderStop,
}: {
	readonly cluster: RouteStopCluster;
	readonly renderStop: (stop: RouteStopView, grouped: boolean) => ReactNode;
}) {
	return (
		<li className="overflow-hidden rounded-lg border border-border/60 bg-muted/40">
			<div className="flex items-center gap-2 px-3 py-2">
				<MapPinnedIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
					{cluster.addressLabel ?? 'Same address'}
				</span>
				<span className="shrink-0 font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wide">
					{cluster.stops.length} stops
				</span>
			</div>
			<ol className="grid gap-px">{cluster.stops.map((stop) => renderStop(stop, true))}</ol>
		</li>
	);
}

function StopRow({
	stop,
	selectedId,
	typeName,
	tags,
	onSelect,
	onHover,
	grouped = false,
}: {
	readonly stop: RouteStopView;
	readonly selectedId: string | null;
	readonly typeName: string | null;
	readonly tags: readonly TagRow[];
	readonly onSelect?: ((id: string | null) => void) | undefined;
	readonly onHover?: ((id: string | null) => void) | undefined;
	readonly grouped?: boolean;
}) {
	const isSelected = stop.routeItemId === selectedId;
	const hasDirections = (stop.directionsToNextItem ?? '').trim().length > 0;

	return (
		<li
			className={cn(
				'relative',
				grouped ? 'bg-background/60' : 'rounded-lg border border-border/60 bg-card',
			)}
		>
			<button
				aria-label={`Show ${stop.name} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full rounded-lg transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onBlur={() => onHover?.(null)}
				onClick={() => onSelect?.(stop.routeItemId)}
				onFocus={() => onHover?.(stop.routeItemId)}
				onMouseEnter={() => onHover?.(stop.routeItemId)}
				onMouseLeave={() => onHover?.(null)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-start gap-3 px-3 py-2.5">
				<OrdinalBadge ordinal={stop.ordinal} stop={stop} />
				<span className="min-w-0 flex-1">
					<span className="flex items-center gap-2">
						<Link
							className="pointer-events-auto w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
							params={{ id: stop.habitatId }}
							to="/larval-surveillance/habitats/$id"
						>
							{stop.name}
						</Link>
						<StopStatus stop={stop} />
					</span>
					<StopMetaChips tags={tags} typeName={typeName} />
					{stop.description.trim().length > 0 ? (
						<span className="mt-1 block whitespace-pre-wrap text-foreground/80 text-xs leading-snug">
							{stop.description}
						</span>
					) : null}
					{hasDirections ? (
						<span className="mt-1 flex items-start gap-1.5 text-muted-foreground text-xs">
							<ChevronRightIcon
								aria-hidden="true"
								className="mt-px size-3 shrink-0 rotate-90 text-muted-foreground/70"
							/>
							<span className="min-w-0 whitespace-pre-wrap">{stop.directionsToNextItem}</span>
						</span>
					) : null}
				</span>
			</div>
		</li>
	);
}

/** The habitat's type (neutral chip) and tags (colored chips) for a stop, or nothing. */
export function StopMetaChips({
	typeName,
	tags,
}: {
	readonly typeName: string | null;
	readonly tags: readonly TagRow[];
}) {
	if (typeName === null && tags.length === 0) {
		return null;
	}
	return (
		<span className="mt-1 flex flex-wrap items-center gap-1">
			{typeName !== null ? (
				<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-medium text-[0.7rem] text-muted-foreground">
					{typeName}
				</span>
			) : null}
			{tags.map((tag) => (
				<TagChip key={tag.id} tag={tag} />
			))}
		</span>
	);
}

function TagChip({ tag }: { readonly tag: TagRow }) {
	const style = tagColorStyle(tag.color);
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[0.7rem]',
				style === null ? 'border-border bg-muted text-muted-foreground' : undefined,
			)}
			style={style ?? undefined}
			title={tag.description ?? undefined}
		>
			{tag.tagName}
		</span>
	);
}

export function OrdinalBadge({
	ordinal,
	stop,
}: {
	readonly ordinal: number;
	readonly stop: { readonly isActive: boolean; readonly isInaccessible: boolean };
}) {
	const tone = stopTone(stop);
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

export function StopStatus({ stop }: { readonly stop: RouteStopView }) {
	if (stop.isInaccessible) {
		return (
			<Badge className="shrink-0" tone="danger" variant="outline">
				<AlertTriangleIcon aria-hidden="true" />
				Inaccessible
			</Badge>
		);
	}
	if (!stop.isActive) {
		return (
			<Badge className="shrink-0" tone="neutral" variant="outline">
				<CircleIcon aria-hidden="true" />
				Inactive
			</Badge>
		);
	}
	return null;
}

/** A tinted chip style from a #RRGGBB tag color, or null to fall back to neutral. */
function tagColorStyle(color: string | null): CSSProperties | null {
	if (color === null || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) {
		return null;
	}
	const hex = color.trim();
	return {
		borderColor: hexWithAlpha(hex, 0.36),
		backgroundColor: hexWithAlpha(hex, 0.14),
		color: hex,
	};
}

function hexWithAlpha(hex: string, alpha: number): string {
	const normalized =
		hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
	const value = Math.round(alpha * 255)
		.toString(16)
		.padStart(2, '0');
	return `${normalized}${value}`;
}
