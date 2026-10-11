/**
 * Each service request filter's control, chip and summary grouping, declared
 * once for the Map and the Table, and the Map's filter card, which
 * holds the search, the Status control, the date range, the Tag and Region
 * pickers, Overdue, and the chips. Takes the binding from
 * `useRecordSetFilters`.
 */

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
import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { useTagOptions } from '../../../hooks/explorer/use-tag-options';
import { FilterChip, FilterGrid, toggle } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import {
	defineFilterDeclarations,
	REGION_FILTER,
	TAG_SOURCE,
} from '../../explorer/filter-declarations';
import { TagBadge } from '../../tag-badge';
import { SERVICE_REQUEST_STATUS_ORDER, serviceRequestStatusLabel } from './legend';
import { type ServiceRequestFilters, serviceRequestRecordSet } from './service-requests-search';

/**
 * Each service request filter's control, chip and summary grouping, in chip
 * order. Search, Tags and Region are the Map's alone, so the Table draws none
 * of the three.
 */
export const serviceRequestFilterDeclarations = defineFilterDeclarations(serviceRequestRecordSet, [
	{
		kind: 'choice',
		key: 'status',
		label: 'Status',
		options: [
			{ value: 'all', label: 'All' },
			...SERVICE_REQUEST_STATUS_ORDER.map((value) => ({
				value,
				label: serviceRequestStatusLabel(value),
			})),
		],
		summary: {
			grouping: 'status',
			title: 'Status',
			sides: SERVICE_REQUEST_STATUS_ORDER.map((value) => ({ value, match: value })),
		},
	},
	{
		kind: 'flag',
		key: 'overdue',
		label: 'Overdue',
	},
	{ kind: 'dateRange' },
	{
		kind: 'text',
		key: 'search',
		label: 'Search service requests',
		placeholder: 'Search requests…',
	},
	{
		kind: 'idSet',
		key: 'tags',
		label: 'Tags',
		empty: 'No tags found.',
		options: TAG_SOURCE,
		unknown: 'Unknown tag',
		field: TagFilter,
		chip: TagChip,
		summary: { grouping: 'tagId', title: 'Tags' },
	},
	REGION_FILTER,
]);

/** The Map's filter card: the controls, and the chips that undo them. */
export function ServiceRequestFilterFields({
	binding,
}: {
	readonly binding: RecordSetFilterBinding<ServiceRequestFilters>;
}) {
	const fields = filterFields(serviceRequestFilterDeclarations, binding);
	// No Tag control for an Organization with no Tags, unless the address names one.
	const { options: tags } = useTagOptions();
	const hasTagFilter = tags.length > 0 || binding.filters.tags.size > 0;
	return (
		<>
			{fields.search}
			{fields.status}
			{fields.dates}
			<FilterGrid>
				{hasTagFilter ? fields.tags : null}
				{fields.regions}
				{fields.overdue}
			</FilterGrid>
			<DeclaredFilterChips binding={binding} declarations={serviceRequestFilterDeclarations} />
		</>
	);
}

function TagFilter({
	selected,
	onChange,
}: {
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const { byId } = useTagOptions();
	const options = [...byId.values()];
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

/** A Tag's chip, drawn as the Tag's own badge, or by name for a Tag the catalog does not hold. */
function TagChip({ id, onRemove }: { readonly id: string; readonly onRemove: () => void }) {
	const tag = useTagOptions().byId.get(id);
	if (tag === undefined) {
		return <FilterChip label="Unknown tag" onRemove={onRemove} />;
	}
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
