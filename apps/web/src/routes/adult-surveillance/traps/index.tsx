import type { CollectionLureRow, CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
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
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	CheckCircle2Icon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	CircleIcon,
	MapPinnedIcon,
	PlusIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { trapDisplayName } from '../-adult-display';
import { toPointFeatureCollection } from '../-adult-map';
import { useAddressNames } from '../-overview-data';

export const Route = createFileRoute('/adult-surveillance/traps/')({
	component: TrapsExplorerRoute,
});

type StatusFilter = 'all' | 'active' | 'inactive';

function TrapsExplorerRoute() {
	const [searchInput, setSearchInput] = useState('');
	const search = useDebouncedValue(searchInput.trim().toLowerCase(), 200);
	const [status, setStatus] = useState<StatusFilter>('active');
	const [methodIds, setMethodIds] = useState<ReadonlySet<string>>(() => new Set());
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);

	const methodNameById = useMemo(
		() => new Map(methods.map((method) => [method.id, method.name])),
		[methods],
	);
	const lureNameById = useMemo(() => new Map(lures.map((lure) => [lure.id, lure.name])), [lures]);

	const filtered = useMemo(() => {
		return traps.filter((trap) => {
			if (status === 'active' && !trap.isActive) {
				return false;
			}
			if (status === 'inactive' && trap.isActive) {
				return false;
			}
			if (methodIds.size > 0 && !methodIds.has(trap.collectionMethodId)) {
				return false;
			}
			if (search.length > 0) {
				const haystack =
					`${trap.trapName ?? ''} ${trap.trapCode ?? ''} ${trap.description ?? ''}`.toLowerCase();
				if (!haystack.includes(search)) {
					return false;
				}
			}
			return true;
		});
	}, [traps, status, methodIds, search]);

	// Traps carry their own point geometry (lat/lng on the row). Address names are
	// resolved separately, only for display in the detail card.
	const addressIds = useMemo(
		() => filtered.map((trap) => trap.addressId).filter((id): id is string => id !== null),
		[filtered],
	);
	const addressNameById = useAddressNames(addressIds);

	const featureCollection = useMemo(
		() =>
			toPointFeatureCollection(
				filtered.map((trap) => ({ id: trap.id, lat: trap.lat, lng: trap.lng })),
			),
		[filtered],
	);

	const selected = useMemo(
		() => filtered.find((trap) => trap.id === selectedId) ?? null,
		[filtered, selectedId],
	);

	// Fly to the selected trap whenever the selection changes.
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

	const hasActiveFilters = status !== 'active' || methodIds.size > 0 || search.length > 0;
	const clearAll = useCallback(() => {
		setStatus('active');
		setMethodIds(new Set());
		setSearchInput('');
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={featureCollection}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<TrapDetailCard
							addressName={
								selected.addressId === null
									? null
									: (addressNameById.get(selected.addressId) ?? null)
							}
							lureName={
								selected.collectionLureId === null
									? null
									: (lureNameById.get(selected.collectionLureId) ?? 'Unknown lure')
							}
							methodName={methodNameById.get(selected.collectionMethodId) ?? 'Unknown method'}
							onClose={() => setSelectedId(null)}
							trap={selected}
						/>
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
					<div className="flex items-center justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Traps</h1>
						<div className="flex items-center gap-2.5">
							<ResultMeta count={filtered.length} />
							<Button asChild size="sm">
								<Link to="/adult-surveillance/traps/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									Add trap
								</Link>
							</Button>
						</div>
					</div>

					<SearchField onChange={setSearchInput} value={searchInput} />

					<SegmentedFilter
						label="Status"
						onChange={setStatus}
						options={STATUS_OPTIONS}
						value={status}
					/>

					<MultiSelectFilter
						empty="No collection methods"
						label="Method"
						onChange={setMethodIds}
						options={methods.map((method) => ({ id: method.id, label: method.name }))}
						selected={methodIds}
					/>

					{hasActiveFilters ? (
						<div className="flex flex-wrap items-center gap-1.5">
							{status !== 'active' ? (
								<FilterChip
									label={`Status: ${status === 'all' ? 'All' : 'Inactive'}`}
									onRemove={() => setStatus('active')}
								/>
							) : null}
							{[...methodIds].map((id) => (
								<FilterChip
									key={id}
									label={methodNameById.get(id) ?? 'Unknown method'}
									onRemove={() => setMethodIds(toggle(methodIds, id))}
								/>
							))}
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

				<TrapResults
					methodNameById={methodNameById}
					onSelect={setSelectedId}
					rows={filtered}
					selectedId={selectedId}
				/>
			</div>
		</MapSplitPage>
	);
}

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' },
];

function ResultMeta({ count }: { readonly count: number }) {
	return (
		<span className="text-muted-foreground text-sm">
			{count === 0 ? 'None' : count === 1 ? '1 trap' : `${count} traps`}
		</span>
	);
}

function SearchField({
	value,
	onChange,
}: {
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="relative">
			<SearchIcon
				aria-hidden="true"
				className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
			/>
			<Input
				aria-label="Search traps by name or code"
				className="pl-9"
				onChange={(event) => onChange(event.target.value)}
				placeholder="Search name or code…"
				type="search"
				value={value}
			/>
			{value.length > 0 ? (
				<button
					aria-label="Clear search"
					className="-translate-y-1/2 absolute top-1/2 right-2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => onChange('')}
					type="button"
				>
					<XIcon aria-hidden="true" className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}

function SegmentedFilter<T extends string>({
	label,
	value,
	onChange,
	options,
}: {
	readonly label: string;
	readonly value: T;
	readonly onChange: (value: T) => void;
	readonly options: readonly { readonly value: T; readonly label: string }[];
}) {
	return (
		<div className="flex items-center gap-3">
			<span className="w-12 shrink-0 font-medium text-muted-foreground text-xs">{label}</span>
			<ToggleGroup
				aria-label={label}
				className="flex-1"
				onValueChange={(next) => {
					if (next) {
						onChange(next as T);
					}
				}}
				size="sm"
				type="single"
				value={value}
				variant="outline"
			>
				{options.map((option) => (
					<ToggleGroupItem className="flex-1 text-xs" key={option.value} value={option.value}>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
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
					className="justify-between font-normal"
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

function TrapResults({
	rows,
	selectedId,
	methodNameById,
	onSelect,
}: {
	readonly rows: readonly TrapRow[];
	readonly selectedId: string | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	if (rows.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">No traps match</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Loosen the filters, or add a trap to start collecting.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((trap) => (
				<TrapListItem
					isSelected={trap.id === selectedId}
					key={trap.id}
					methodName={methodNameById.get(trap.collectionMethodId) ?? 'Unknown method'}
					onSelect={onSelect}
					trap={trap}
				/>
			))}
		</ul>
	);
}

function TrapListItem({
	trap,
	methodName,
	isSelected,
	onSelect,
}: {
	readonly trap: TrapRow;
	readonly methodName: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<li className="relative">
			<button
				aria-label={`Show ${trapDisplayName(trap)} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={() => onSelect(trap.id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
				<StatusDot isActive={trap.isActive} />
				<span className="min-w-0 flex-1">
					<Link
						className="pointer-events-auto relative z-10 block w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						params={{ id: trap.id }}
						to="/adult-surveillance/traps/$id"
					>
						{trapDisplayName(trap)}
					</Link>
					<span className="block truncate text-muted-foreground text-xs">{methodName}</span>
				</span>
				<StatusBadge isActive={trap.isActive} />
				<Link
					aria-label={`View details for ${trapDisplayName(trap)}`}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: trap.id }}
					title="View trap details"
					to="/adult-surveillance/traps/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

function TrapDetailCard({
	trap,
	methodName,
	lureName,
	addressName,
	onClose,
}: {
	readonly trap: TrapRow;
	readonly methodName: string;
	readonly lureName: string | null;
	readonly addressName: string | null;
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
								params={{ id: trap.id }}
								to="/adult-surveillance/traps/$id"
							>
								{trapDisplayName(trap)}
							</Link>
						</h2>
						<p className="truncate text-muted-foreground text-sm">{methodName}</p>
					</div>
					<div className="flex items-center gap-1.5">
						<StatusBadge isActive={trap.isActive} />
						<Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
							<XIcon aria-hidden="true" />
						</Button>
					</div>
				</div>

				<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
					<DetailFact label="Lure" value={lureName ?? 'None'} />
					<DetailFact label="Address" value={addressName ?? 'No linked address'} wide />
					<DetailFact label="Coordinates" value={coordinateLabel(trap)} wide />
				</dl>

				<div className="mt-3 flex justify-end">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id">
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

function StatusBadge({ isActive }: { readonly isActive: boolean }) {
	return isActive ? (
		<Badge tone="success" variant="outline">
			<CheckCircle2Icon aria-hidden="true" />
			Active
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			<CircleIcon aria-hidden="true" />
			Inactive
		</Badge>
	);
}

function StatusDot({ isActive }: { readonly isActive: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'size-2 shrink-0 rounded-full',
				isActive ? 'bg-[var(--success)]' : 'bg-muted-foreground/50',
			)}
		/>
	);
}

// --- helpers ----------------------------------------------------------------

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

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handle = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(handle);
	}, [value, delayMs]);
	return debounced;
}
