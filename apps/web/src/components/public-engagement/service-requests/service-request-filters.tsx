/**
 * The Service Requests map's filter card and the chips that undo it. The card
 * holds the search, the Status control, the date range, the Tag and Region
 * pickers, and the chips; the chips are exported apart so the in-view summary
 * can draw them above its groupings. Both take the filter state the route
 * binds from the URL and the writes that change it.
 */

import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
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
import { CheckIcon, ChevronDownIcon, TagIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useState } from 'react';
import type { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import type { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import type { Tag } from '../../../hooks/queries/tag-view';
import { DateRangeFilter } from '../../date-range-filter';
import {
	ActiveFilterBar,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	SegmentedFilter,
	toggle,
} from '../../explorer';
import { TagBadge } from '../../tag-badge';
import {
	SERVICE_REQUEST_STATUS_ORDER,
	type ServiceRequestStatusFilter,
	serviceRequestStatusLabel,
} from './legend';

const STATUS_OPTIONS: readonly {
	readonly value: ServiceRequestStatusFilter;
	readonly label: string;
}[] = [
	{ value: 'all', label: 'All' },
	...SERVICE_REQUEST_STATUS_ORDER.map((value) => ({
		value,
		label: serviceRequestStatusLabel(value),
	})),
];

/** The filter state the chips read, and the writes that undo each chip. */
export interface ServiceRequestFilterChipProps {
	readonly activeFilterCount: number;
	readonly availableTags: readonly Tag[];
	readonly onClearAll: () => void;
	readonly regions: ReturnType<typeof useRegionOptions>;
	readonly search: string;
	readonly selectedRegionIds: ReadonlySet<string>;
	readonly selectedTagIds: ReadonlySet<string>;
	readonly setSearch: (next: string) => void;
	readonly setSelectedRegionIds: (next: ReadonlySet<string>) => void;
	readonly setSelectedTagIds: (next: ReadonlySet<string>) => void;
	readonly setStatus: (next: ServiceRequestStatusFilter) => void;
	readonly status: ServiceRequestStatusFilter;
}

/** The filter card's contents: the five controls and the chips that undo them. */
export function ServiceRequestFilterFields({
	dateRange,
	onClearSearch,
	...chips
}: ServiceRequestFilterChipProps & {
	readonly dateRange: ReturnType<typeof useDateRangeFilters>;
	readonly onClearSearch: () => void;
}) {
	const {
		availableTags,
		regions,
		search,
		selectedRegionIds,
		selectedTagIds,
		setSearch,
		setSelectedRegionIds,
		setSelectedTagIds,
		setStatus,
		status,
	} = chips;
	const hasTagFilter = availableTags.length > 0 || selectedTagIds.size > 0;
	return (
		<>
			<SearchInput
				label="Search service requests"
				onChange={(event) => setSearch(event.target.value)}
				onClear={onClearSearch}
				placeholder="Search requests…"
				value={search}
			/>

			<SegmentedFilter
				label="Status"
				onChange={setStatus}
				options={STATUS_OPTIONS}
				value={status}
			/>

			<DateRangeFilter {...dateRange} />

			<FilterGrid>
				{hasTagFilter ? (
					<TagFilter
						onChange={setSelectedTagIds}
						options={availableTags}
						selected={selectedTagIds}
					/>
				) : null}
				<MultiSelectFilter
					empty="No regions"
					label="Region"
					onChange={setSelectedRegionIds}
					options={regions.options}
					selected={selectedRegionIds}
				/>
			</FilterGrid>

			<ServiceRequestFilterChips {...chips} />
		</>
	);
}

/** What is currently narrowing the list, each chip removing its own filter. */
export function ServiceRequestFilterChips({
	activeFilterCount,
	availableTags,
	onClearAll,
	regions,
	search,
	selectedRegionIds,
	selectedTagIds,
	setSearch,
	setSelectedRegionIds,
	setSelectedTagIds,
	setStatus,
	status,
}: ServiceRequestFilterChipProps) {
	if (activeFilterCount === 0) {
		return null;
	}
	return (
		<ActiveFilterBar onClearAll={onClearAll}>
			<StatusChip onReset={() => setStatus('all')} status={status} />
			<SearchChip onClear={() => setSearch('')} search={search} />
			{availableTags
				.filter((tag) => selectedTagIds.has(tag.id))
				.map((tag) => (
					<RemovableTagChip
						key={tag.id}
						onRemove={() => setSelectedTagIds(toggle(selectedTagIds, tag.id))}
						tag={tag}
					/>
				))}
			{[...selectedRegionIds].map((id) => (
				<FilterChip
					key={`region-${id}`}
					label={regions.nameById.get(id) ?? 'Unknown region'}
					onRemove={() => setSelectedRegionIds(toggle(selectedRegionIds, id))}
				/>
			))}
		</ActiveFilterBar>
	);
}

/** All is the default, so only Open or Closed is worth a chip. */
function StatusChip({
	onReset,
	status,
}: {
	readonly onReset: () => void;
	readonly status: ServiceRequestStatusFilter;
}) {
	if (status === 'all') {
		return null;
	}
	return <FilterChip label={`Status: ${serviceRequestStatusLabel(status)}`} onRemove={onReset} />;
}

function SearchChip({
	onClear,
	search,
}: {
	readonly onClear: () => void;
	readonly search: string;
}) {
	if (search.trim().length === 0) {
		return null;
	}
	return <FilterChip label={`Search: ${search}`} onRemove={onClear} />;
}

function TagFilter({
	options,
	selected,
	onChange,
}: {
	readonly options: readonly Tag[];
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const [open, setOpen] = useState(false);
	const count = selected.size;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label="Filter by tag"
					className="h-8 justify-between font-normal"
					size="sm"
					variant="outline"
				>
					<TagIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
					<span className="truncate">Tags</span>
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
					<CommandInput placeholder="Search tags…" />
					<CommandList>
						<CommandEmpty>No tags found.</CommandEmpty>
						<CommandGroup>
							{options.map((tag) => {
								const isSelected = selected.has(tag.id);
								return (
									<CommandItem
										key={tag.id}
										onSelect={() => onChange(toggle(selected, tag.id))}
										value={`${tag.name} ${tag.id}`}
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
										<TagBadge tag={tag} />
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

function RemovableTagChip({ tag, onRemove }: { readonly tag: Tag; readonly onRemove: () => void }) {
	return (
		<span className="inline-flex items-center gap-1">
			<TagBadge tag={tag} />
			<button
				aria-label={`Remove ${tag.name} filter`}
				className="relative rounded-full p-0.5 text-muted-foreground opacity-70 after:absolute after:-inset-1.5 transition-opacity hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onRemove}
				type="button"
			>
				<XIcon aria-hidden="true" className="size-3" />
			</button>
		</span>
	);
}
