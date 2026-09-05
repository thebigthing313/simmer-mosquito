import { SplitPage } from '@simmer-mosquito/ui-web/components/app-shell/outlet/split-page';
import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { ExplorerHeader, ExplorerRow } from '../../components/explorer';
import { trapDisplayName } from '../../hooks/queries/trap-view';
import type { TrapListing } from '../../hooks/queries/use-active-traps';
import {
	type FilterCodecs,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../lib/search-filters';
import { TrapCollectionHistory } from './-trap-collection-history';
import {
	ALL_METHODS,
	type DirectoryFilters,
	type MethodTab,
	useTrapDirectory,
} from './-trap-directory-data';
import { DirectoryTab, DirectoryTabsList } from './-trap-directory-tabs';

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
 * Every trap the organization is currently running, and what each one has
 * caught.
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

	const { methodTabs, method, visibleTraps, selectedTrap, hasActiveTraps, isNarrowed } =
		useTrapDirectory(filters);

	const selectMethod = useCallback(
		(next: string) => setFilters({ method: next === ALL_METHODS ? '' : next }),
		[setFilters],
	);
	const selectTrap = useCallback((next: string) => setFilters({ trap: next }), [setFilters]);

	return (
		<SplitPage aside={<SelectedTrap hasActiveTraps={hasActiveTraps} trap={selectedTrap} />}>
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
						label="Search traps by name or code"
						onChange={setSearchInput}
						onClear={() => {
							clearSearchInput();
							commitSearch('');
						}}
						placeholder="Search name or code…"
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
						isNarrowed={isNarrowed}
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
 * The method strip. Absent entirely when the organization has no active traps —
 * an "All" tab over nothing is a control that cannot do anything.
 */
function MethodTabs({ tabs }: { readonly tabs: readonly MethodTab[] }) {
	if (tabs.length === 0) {
		return null;
	}
	return (
		<DirectoryTabsList label="Collection method">
			<DirectoryTab value={ALL_METHODS}>All</DirectoryTab>
			{tabs.map((tab) => (
				<DirectoryTab key={tab.id} value={tab.id}>
					{tab.label}
				</DirectoryTab>
			))}
		</DirectoryTabsList>
	);
}

/** The right half: the selected trap's history, or the reason there isn't one. */
function SelectedTrap({
	trap,
	hasActiveTraps,
}: {
	readonly trap: TrapListing | null;
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
			trap={trap}
		/>
	);
}

// --- the directory ----------------------------------------------------------

function TrapList({
	traps,
	selectedId,
	showMethod,
	isNarrowed,
	onSelect,
}: {
	readonly traps: readonly TrapListing[];
	readonly selectedId: string | null;
	/** The method line is noise under a method tab, where every row shares it. */
	readonly showMethod: boolean;
	/** Whether a filter is what emptied the list. Changes the empty copy. */
	readonly isNarrowed: boolean;
	readonly onSelect: (id: string) => void;
}) {
	if (traps.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<TrapIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="m-0 font-medium text-foreground text-sm">
					{isNarrowed ? 'No traps match' : 'No active traps'}
				</p>
				<p className="m-0 max-w-[34ch] text-muted-foreground text-sm">
					{isNarrowed
						? 'Clear the search, or try another collection method.'
						: 'The directory lists traps that are currently deployed. Retired traps stay on the map.'}
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
					onSelect={onSelect}
					showMethod={showMethod}
					trap={trap}
				/>
			))}
		</ul>
	);
}

/**
 * One trap in the directory: the shared explorer row, with no date rail — a trap
 * is a standing record, not something that happened on a day.
 */
function TrapListRow({
	trap,
	showMethod,
	isSelected,
	onSelect,
}: {
	readonly trap: TrapListing;
	readonly showMethod: boolean;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const label = trapDisplayName(trap);
	const detailLink = { to: '/adult-surveillance/traps/$id', params: { id: trap.id } } as const;
	return (
		<li>
			<ExplorerRow
				detailLabel={`Open the record for ${label}`}
				detailLink={detailLink}
				isSelected={isSelected}
				onSelect={() => onSelect(trap.id)}
				selectLabel={`Show collections for ${label}`}
				subtitle={showMethod ? trap.methodName : undefined}
				title={label}
			/>
		</li>
	);
}

// --- the empty right half ---------------------------------------------------

/**
 * The right half with no trap in it.
 *
 * Only two states reach here. The pane holds whichever trap the list has
 * anchored to, so it is empty exactly when the list is — either the
 * organization runs no active traps, or the filters hid every one of them.
 * There is no third "nothing picked yet" state: the directory selects for you.
 */
function NoSelection({ hasTraps }: { readonly hasTraps: boolean }) {
	return (
		<div className="flex h-full items-center justify-center p-8">
			<Empty className="max-w-[42ch]">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<TrapIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{hasTraps ? 'No Traps Match' : 'No Active Traps'}</EmptyTitle>
					<EmptyDescription>
						{hasTraps
							? 'Clear the search, or try another collection method, to pick a trap.'
							: 'Deploy a trap, or reactivate a retired one, and its collections will read here.'}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
