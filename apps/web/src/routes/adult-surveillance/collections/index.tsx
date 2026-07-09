import type { CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@simmer-mosquito/ui-web/components/ui/command';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	MapPinnedIcon,
	PlusIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { gte, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { CollectionFlagBadges, trapDisplayName } from '../-adult-display';
import { toPointFeatureCollection } from '../-adult-map';
import { addDaysToDateString, formatMonthDay, todayInTimeZone } from '../-overview-data';

export const Route = createFileRoute('/adult-surveillance/collections/')({
	component: CollectionsExplorerRoute,
});

interface CollectionListRow {
	readonly id: string;
	readonly trapId: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly collectionMethodId: string;
	readonly collectedAt: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
}

interface DatePreset {
	readonly id: string;
	readonly label: string;
	readonly days: number;
}

const DATE_PRESETS: readonly DatePreset[] = [
	{ id: '30d', label: 'Last 30 days', days: 30 },
	{ id: '90d', label: 'Last 90 days', days: 90 },
	{ id: '365d', label: 'Last 12 months', days: 365 },
];
const DEFAULT_PRESET_ID = '90d';

const collectionsGcTimeMs = 30_000;

function CollectionsExplorerRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
	const [methodIds, setMethodIds] = useState<ReadonlySet<string>>(() => new Set());
	const [problemOnly, setProblemOnly] = useState(false);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const since = useMemo(() => {
		const days = DATE_PRESETS.find((entry) => entry.id === presetId)?.days ?? 90;
		return addDaysToDateString(today, -(days - 1));
	}, [presetId, today]);

	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);

	const trapById = useMemo(() => new Map(traps.map((trap) => [trap.id, trap])), [traps]);
	const methodNameById = useMemo(
		() => new Map(methods.map((method) => [method.id, method.name])),
		[methods],
	);

	const { rows, isReady } = useCollectionsSince(since);

	const filtered = useMemo(() => {
		return rows.filter((row) => {
			if (methodIds.size > 0 && !methodIds.has(row.collectionMethodId)) {
				return false;
			}
			if (problemOnly && !row.hasProblem) {
				return false;
			}
			return true;
		});
	}, [rows, methodIds, problemOnly]);

	// Collections carry their own point geometry (lat/lng on the row).
	const featureCollection = useMemo(
		() =>
			toPointFeatureCollection(filtered.map((row) => ({ id: row.id, lat: row.lat, lng: row.lng }))),
		[filtered],
	);

	const selected = useMemo(
		() => filtered.find((row) => row.id === selectedId) ?? null,
		[filtered, selectedId],
	);

	useEffect(() => {
		if (map === null || selected === null) {
			return;
		}
		map.flyTo({
			center: [selected.lng, selected.lat],
			zoom: Math.max(map.getZoom(), 14),
			duration: 700,
		});
	}, [map, selected]);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);

	const hasActiveFilters = presetId !== DEFAULT_PRESET_ID || methodIds.size > 0 || problemOnly;
	const clearAll = useCallback(() => {
		setPresetId(DEFAULT_PRESET_ID);
		setMethodIds(new Set());
		setProblemOnly(false);
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={featureCollection}
						geoJsonInteraction={{ selectedId, onSelectFeature: setSelectedId }}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<CollectionDetailCard
							methodName={methodNameById.get(selected.collectionMethodId) ?? 'Unknown method'}
							onClose={() => setSelectedId(null)}
							row={selected}
							trapName={
								selected.trapId === null
									? null
									: (trapNameFor(selected.trapId, trapById) ?? 'Unknown trap')
							}
						/>
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
					<div className="flex items-center justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Collections</h1>
						<div className="flex items-center gap-2.5">
							<ResultMeta count={filtered.length} isReady={isReady} />
							<Button asChild size="sm">
								<Link to="/adult-surveillance/collections/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									Record
								</Link>
							</Button>
						</div>
					</div>

					<div className="flex flex-wrap gap-1.5">
						{DATE_PRESETS.map((preset) => {
							const isActive = preset.id === presetId;
							return (
								<button
									aria-pressed={isActive}
									className={cn(
										'rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
										isActive
											? 'border-primary/50 bg-primary/10 text-foreground'
											: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
									)}
									key={preset.id}
									onClick={() => setPresetId(preset.id)}
									type="button"
								>
									{preset.label}
								</button>
							);
						})}
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<MultiSelectFilter
							empty="No collection methods"
							label="Method"
							onChange={setMethodIds}
							options={methods.map((method) => ({ id: method.id, label: method.name }))}
							selected={methodIds}
						/>
						<ProblemToggle onChange={setProblemOnly} value={problemOnly} />
					</div>

					{hasActiveFilters ? (
						<div className="flex flex-wrap items-center gap-1.5">
							{[...methodIds].map((id) => (
								<FilterChip
									key={id}
									label={methodNameById.get(id) ?? 'Unknown method'}
									onRemove={() => setMethodIds(toggle(methodIds, id))}
								/>
							))}
							{problemOnly ? (
								<FilterChip label="Problems only" onRemove={() => setProblemOnly(false)} />
							) : null}
							<button
								className="ml-auto rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={clearAll}
								type="button"
							>
								Clear all
							</button>
						</div>
					) : null}
				</div>

				<CollectionResults
					isReady={isReady}
					methodNameById={methodNameById}
					onSelect={setSelectedId}
					rows={filtered}
					selectedId={selectedId}
					trapById={trapById}
				/>
			</div>
		</MapSplitPage>
	);
}

// --- data hook --------------------------------------------------------------

function useCollectionsSince(sinceDate: string): {
	readonly rows: readonly CollectionListRow[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: collectionsGcTimeMs,
			query: (query) =>
				query
					.from({ collection: webCollections.collections })
					.where(({ collection }) => gte(collection.collectedAt, sinceDate))
					.orderBy(({ collection }) => collection.collectedAt, 'desc')
					.select(({ collection }) => ({
						id: collection.id,
						trapId: collection.trapId,
						lat: collection.lat,
						lng: collection.lng,
						collectionMethodId: collection.collectionMethodId,
						collectedAt: collection.collectedAt,
						hasProblem: collection.hasProblem,
						isZeroResult: collection.isZeroResult,
						hasBycatch: collection.hasBycatch,
					})),
		},
		[sinceDate],
	);
	return {
		rows: (result.data ?? []) as unknown as readonly CollectionListRow[],
		isReady: result.isReady,
	};
}

// --- filter controls --------------------------------------------------------

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'] as const;

function ResultMeta({ count, isReady }: { readonly count: number; readonly isReady: boolean }) {
	if (!isReady) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{count === 0 ? 'None' : count === 1 ? '1 collection' : `${count} collections`}
		</span>
	);
}

function ProblemToggle({
	value,
	onChange,
}: {
	readonly value: boolean;
	readonly onChange: (next: boolean) => void;
}) {
	return (
		<button
			aria-pressed={value}
			className={cn(
				'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				value
					? 'border-primary bg-primary/10 text-foreground'
					: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
			)}
			onClick={() => onChange(!value)}
			type="button"
		>
			<span
				className={cn(
					'flex size-3.5 items-center justify-center rounded-[4px] border',
					value ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
				)}
			>
				{value ? <CheckIcon aria-hidden="true" className="size-2.5" /> : null}
			</span>
			Problems only
		</button>
	);
}

interface FilterOption {
	readonly id: string;
	readonly label: string;
}

function MultiSelectFilter({
	label,
	empty,
	options,
	selected,
	onChange,
}: {
	readonly label: string;
	readonly empty: string;
	readonly options: readonly FilterOption[];
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const [open, setOpen] = useState(false);
	const count = selected.size;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label={`Filter by ${label}`}
					className="h-8 justify-between font-normal"
					size="sm"
					variant="outline"
				>
					<span className="truncate">{label}</span>
					<span className="flex items-center gap-1">
						{count > 0 ? (
							<Badge className="px-1.5" variant="secondary">
								{count}
							</Badge>
						) : null}
						<ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command>
					<CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
					<CommandList>
						<CommandEmpty>{empty}</CommandEmpty>
						<CommandGroup>
							{options.map((option) => {
								const isSelected = selected.has(option.id);
								return (
									<CommandItem
										key={option.id}
										onSelect={() => onChange(toggle(selected, option.id))}
										value={`${option.label} ${option.id}`}
									>
										<span
											className={cn(
												'flex size-4 items-center justify-center rounded-sm border',
												isSelected
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-input',
											)}
										>
											{isSelected ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
										</span>
										<span className="truncate">{option.label}</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function FilterChip({
	label,
	onRemove,
}: {
	readonly label: string;
	readonly onRemove: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-foreground text-xs">
			{label}
			<button
				aria-label={`Remove ${label} filter`}
				className="rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onRemove}
				type="button"
			>
				<XIcon aria-hidden="true" className="size-3" />
			</button>
		</span>
	);
}

// --- results ----------------------------------------------------------------

function CollectionResults({
	rows,
	isReady,
	selectedId,
	trapById,
	methodNameById,
	onSelect,
}: {
	readonly rows: readonly CollectionListRow[];
	readonly isReady: boolean;
	readonly selectedId: string | null;
	readonly trapById: ReadonlyMap<string, TrapRow>;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	if (!isReady && rows.length === 0) {
		return (
			<div className="grid gap-px overflow-y-auto p-2">
				{SKELETON_KEYS.map((key) => (
					<div className="h-[60px] animate-pulse rounded-md bg-muted/60" key={key} />
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">No collections in range</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Widen the time window or loosen the filters to bring collections into range.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((row) => (
				<CollectionListItem
					isSelected={row.id === selectedId}
					key={row.id}
					methodName={methodNameById.get(row.collectionMethodId) ?? 'Unknown method'}
					onSelect={onSelect}
					row={row}
					trapName={
						row.trapId === null ? null : (trapNameFor(row.trapId, trapById) ?? 'Unknown trap')
					}
				/>
			))}
		</ul>
	);
}

function CollectionListItem({
	row,
	trapName,
	methodName,
	isSelected,
	onSelect,
}: {
	readonly row: CollectionListRow;
	readonly trapName: string | null;
	readonly methodName: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const label = trapName ?? 'Ad-hoc collection';
	return (
		<li className="relative">
			<button
				aria-label={`Show ${label} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={() => onSelect(row.id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
				<span className="w-11 shrink-0 text-muted-foreground text-xs tabular-nums">
					{row.collectedAt === null ? '—' : formatMonthDay(row.collectedAt)}
				</span>
				<span className="min-w-0 flex-1">
					<Link
						className="pointer-events-auto relative z-10 block w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						params={{ id: row.id }}
						to="/adult-surveillance/collections/$id"
					>
						{label}
					</Link>
					<span className="block truncate text-muted-foreground text-xs">{methodName}</span>
				</span>
				<CollectionFlagBadges className="flex shrink-0 items-center gap-1.5" collection={row} />
				<Link
					aria-label={`View details for ${label}`}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: row.id }}
					title="View collection details"
					to="/adult-surveillance/collections/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

function CollectionDetailCard({
	row,
	trapName,
	methodName,
	onClose,
}: {
	readonly row: CollectionListRow;
	readonly trapName: string | null;
	readonly methodName: string;
	readonly onClose: () => void;
}) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<article className="pointer-events-auto w-full max-w-[460px] rounded-lg border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 grid gap-0.5">
						<h2 className="font-semibold text-base text-foreground leading-tight">
							<Link
								className="block w-fit max-w-full truncate rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
								params={{ id: row.id }}
								to="/adult-surveillance/collections/$id"
							>
								{trapName ?? 'Ad-hoc collection'}
							</Link>
						</h2>
						<p className="truncate text-muted-foreground text-sm">
							{methodName}
							{row.collectedAt === null ? '' : ` · ${formatMonthDay(row.collectedAt)}`}
						</p>
					</div>
					<Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
						<XIcon aria-hidden="true" />
					</Button>
				</div>

				<CollectionFlagBadges
					className="mt-3 flex flex-wrap items-center gap-1.5"
					collection={row}
				/>

				<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
					<DetailFact label="Coordinates" value={coordinateLabel(row)} wide />
				</dl>

				<div className="mt-3 flex justify-end">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: row.id }} to="/adult-surveillance/collections/$id">
							View full details
							<ChevronRightIcon aria-hidden="true" />
						</Link>
					</Button>
				</div>
			</article>
		</div>
	);
}

function DetailFact({
	label,
	value,
	wide = false,
}: {
	readonly label: string;
	readonly value: string;
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
			<dd className="truncate font-medium text-foreground">{value}</dd>
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

function trapNameFor(trapId: string, trapById: ReadonlyMap<string, TrapRow>): string | null {
	const trap = trapById.get(trapId);
	return trap === undefined ? null : trapDisplayName(trap);
}

function toggle(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
	const next = new Set(set);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	return next;
}

function coordinateLabel(point: { readonly lat: number; readonly lng: number }): string {
	return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}
