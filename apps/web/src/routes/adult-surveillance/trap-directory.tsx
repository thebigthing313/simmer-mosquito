import type { TrapRow } from '@simmer-mosquito/sync';
import { SplitPage } from '@simmer-mosquito/ui-web/components/app-shell/outlet/split-page';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tabs';
import {
	ChevronRightIcon,
	iconRegistry,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback } from 'react';
import { ExplorerHeader } from '../../components/explorer';
import {
	type FilterCodecs,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../lib/search-filters';
import { trapDisplayName } from './-adult-display';
import { TrapCollectionHistory } from './-trap-collection-history';
import {
	ALL_METHODS,
	type DirectoryFilters,
	type MethodTab,
	useTrapDirectory,
} from './-trap-directory-data';

const TrapIcon = iconRegistry.entities.trap.icon;

const DIRECTORY_DEFAULTS: DirectoryFilters = { search: '', method: '', trap: '' };

const DIRECTORY_CODECS: FilterCodecs<DirectoryFilters> = {
	search: textParam,
	method: textParam,
	trap: textParam,
};

export const Route = createFileRoute('/adult-surveillance/trap-directory')({
	component: TrapDirectoryRoute,
	validateSearch: searchValidator(DIRECTORY_CODECS),
});

const RESULT_NOUN = { one: 'trap', many: 'traps' };

/**
 * Every trap the agency is currently running, and what each one has caught.
 *
 * The explorer answers "where are the traps"; this answers "what has this trap
 * been doing", which is a question about time rather than place — so it spends
 * no room on a map. The left half is the standing inventory, cut by collection
 * method because a light trap and a gravid trap are read against different
 * expectations. The right half is the selected trap's history, by season.
 *
 * Selection stays in the URL: a directory is something an operator hands to a
 * colleague ("look at what BG-04 did in July"), and a bare route would land them
 * on whatever trap happens to sort first.
 */
function TrapDirectoryRoute() {
	const { filters, setFilters } = useSearchFilters(DIRECTORY_DEFAULTS, DIRECTORY_CODECS);

	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const {
		input: searchInput,
		setInput: setSearchInput,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(filters.search, commitSearch, 200);

	const { methodNameById, methodTabs, method, visibleTraps, selectedTrap, hasActiveTraps } =
		useTrapDirectory(filters);

	const selectMethod = useCallback(
		(next: string) => setFilters({ method: next === ALL_METHODS ? '' : next }),
		[setFilters],
	);
	const selectTrap = useCallback((next: string) => setFilters({ trap: next }), [setFilters]);

	return (
		<SplitPage
			aside={
				<SelectedTrap
					hasActiveTraps={hasActiveTraps}
					methodNameById={methodNameById}
					trap={selectedTrap}
				/>
			}
		>
			<Tabs
				className="flex h-full min-h-0 flex-col gap-0"
				onValueChange={selectMethod}
				value={method}
			>
				<ExplorerHeader
					icon={TrapIcon}
					isLoading={false}
					noun={RESULT_NOUN}
					title="Trap Directory"
					total={visibleTraps.length}
				>
					<SearchField
						onChange={setSearchInput}
						onClear={() => {
							clearSearchInput();
							commitSearch('');
						}}
						value={searchInput}
					/>
					<MethodTabs tabs={methodTabs} />
				</ExplorerHeader>

				{/*
				 * One panel, always the open tab's. Radix mounts no other, so a panel per
				 * method would be markup nobody can reach.
				 */}
				<TabsContent className="flex min-h-0 flex-1 flex-col" value={method}>
					<TrapList
						methodNameById={methodNameById}
						onSelect={selectTrap}
						selectedId={selectedTrap?.id ?? null}
						showMethod={method === ALL_METHODS}
						traps={visibleTraps}
					/>
				</TabsContent>
			</Tabs>
		</SplitPage>
	);
}

/**
 * The method strip. Absent entirely when the agency has no active traps — an
 * "All" tab over nothing is a control that cannot do anything.
 */
function MethodTabs({ tabs }: { readonly tabs: readonly MethodTab[] }) {
	if (tabs.length === 0) {
		return null;
	}
	return (
		<TabsList className="h-auto w-full flex-wrap justify-start" variant="line">
			<TabsTrigger value={ALL_METHODS}>All</TabsTrigger>
			{tabs.map((tab) => (
				<TabsTrigger key={tab.id} value={tab.id}>
					{tab.label}
				</TabsTrigger>
			))}
		</TabsList>
	);
}

/** The right half: the selected trap's history, or the reason there isn't one. */
function SelectedTrap({
	trap,
	methodNameById,
	hasActiveTraps,
}: {
	readonly trap: TrapRow | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly hasActiveTraps: boolean;
}) {
	if (trap === null) {
		return <NoSelection hasTraps={hasActiveTraps} />;
	}
	return (
		<TrapCollectionHistory
			// Keyed on the trap, so switching selection remounts rather than carrying
			// the previous trap's open year across to one that may not have it.
			key={trap.id}
			methodName={methodNameById.get(trap.collectionMethodId) ?? 'Unknown method'}
			trap={trap}
		/>
	);
}

// --- the directory ----------------------------------------------------------

function TrapList({
	traps,
	selectedId,
	methodNameById,
	showMethod,
	onSelect,
}: {
	readonly traps: readonly TrapRow[];
	readonly selectedId: string | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	/** The method line is noise under a method tab, where every row shares it. */
	readonly showMethod: boolean;
	readonly onSelect: (id: string) => void;
}) {
	if (traps.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<TrapIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="m-0 font-medium text-foreground text-sm">No active traps</p>
				<p className="m-0 max-w-[34ch] text-muted-foreground text-sm">
					The directory lists traps that are currently deployed. Retired traps stay on the map.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{traps.map((trap) => (
				<TrapListRow
					isSelected={trap.id === selectedId}
					key={trap.id}
					methodName={methodNameById.get(trap.collectionMethodId) ?? 'Unknown method'}
					onSelect={onSelect}
					showMethod={showMethod}
					trap={trap}
				/>
			))}
		</ul>
	);
}

/**
 * One trap in the directory. Clicking the row shows its collections beside the
 * list; the chevron opens the trap's own record. Two sibling controls rather
 * than a link inside a button, which is what the explorer rows do.
 */
function TrapListRow({
	trap,
	methodName,
	showMethod,
	isSelected,
	onSelect,
}: {
	readonly trap: TrapRow;
	readonly methodName: string;
	readonly showMethod: boolean;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const label = trapDisplayName(trap);
	return (
		<li className="relative">
			<button
				aria-label={`Show collections for ${label}`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={() => onSelect(trap.id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium text-foreground text-sm">{label}</span>
					{showMethod ? (
						<span className="block truncate text-muted-foreground text-xs">{methodName}</span>
					) : null}
				</span>
				<Link
					aria-label={`Open the record for ${label}`}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: trap.id }}
					title={`Open the record for ${label}`}
					to="/adult-surveillance/traps/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

// --- the empty right half ---------------------------------------------------

function NoSelection({ hasTraps }: { readonly hasTraps: boolean }) {
	return (
		<div className="flex h-full items-center justify-center p-8">
			<Empty className="max-w-[42ch]">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<TrapIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{hasTraps ? 'No Trap Selected' : 'No Active Traps'}</EmptyTitle>
					<EmptyDescription>
						{hasTraps
							? 'Choose a trap to read its collections, season by season.'
							: 'Deploy a trap, or reactivate a retired one, and its collections will read here.'}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}

// --- filters ----------------------------------------------------------------

function SearchField({
	value,
	onChange,
	onClear,
}: {
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly onClear: () => void;
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
					onClick={onClear}
					type="button"
				>
					<XIcon aria-hidden="true" className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
