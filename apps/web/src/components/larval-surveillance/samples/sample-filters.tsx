/**
 * The sample filters, drawn the same way on the Samples Map and the Samples
 * Table: the date window, Status, the species, region and non-mosquito
 * filters, and the chips for whatever is set, which the Samples summary also
 * draws. It returns the blocks bare, so each surface puts them in its own
 * frame. Takes the binding from `useRecordSetFilters`.
 */

import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
import { CheckIcon, ChevronDownIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useState } from 'react';
import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { useSpeciesOptions } from '../../../hooks/explorer/use-species-options';
import { FilterFieldsLayout, FilterGrid, toggle } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import {
	defineFilterDeclarations,
	REGION_FILTER,
	SPECIES_SOURCE,
} from '../../explorer/filter-declarations';
import { SAMPLE_STATUS_COLORS } from '../../map';
import { type SampleFilters, type SampleStatusValue, sampleRecordSet } from '../samples-search';
import { SAMPLE_STATUS_ORDER, sampleStatusLabel } from './legend';

const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

/** Each sample filter's control, chip and summary grouping, in chip order. */
export const sampleFilterDeclarations = defineFilterDeclarations(sampleRecordSet, [
	{ kind: 'dateRange' },
	{
		kind: 'choice',
		key: 'status',
		label: 'Status',
		options: [
			{ value: 'all', label: 'All' },
			...SAMPLE_STATUS_ORDER.map((value) => ({
				value,
				label: sampleStatusLabel(value),
				color: SAMPLE_STATUS_COLORS[value],
			})),
		],
		bareChip: true,
		field: StatusFilter,
		summary: {
			grouping: 'status',
			title: 'Status',
			sides: SAMPLE_STATUS_ORDER.map((value) => ({ value, match: value })),
		},
	},
	{
		kind: 'idSet',
		key: 'species',
		label: 'Species',
		empty: 'No species in your catalog.',
		options: SPECIES_SOURCE,
		unknown: 'Unknown species',
		italic: true,
		field: SpeciesFilter,
		summary: { grouping: 'species', title: 'Species' },
	},
	REGION_FILTER,
	{
		kind: 'flag',
		key: 'nonMosquito',
		label: 'Non-mosquito material',
		summary: { grouping: 'nonMosquito', title: 'Material', label: 'Non-mosquito material' },
	},
]);

export function SampleFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<SampleFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(sampleFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={<DeclaredFilterChips binding={binding} declarations={sampleFilterDeclarations} />}
			controls={fields.dates}
			popovers={
				<div className="grid gap-3">
					{fields.status}
					<FilterGrid>
						{fields.species}
						{fields.regions}
					</FilterGrid>
					<div>{fields.nonMosquito}</div>
				</div>
			}
			wide={wide}
		/>
	);
}

/**
 * Lifecycle-status filter as a single-select chip row. Each status chip carries
 * the color it maps to on the map, so the control doubles as the map's legend.
 */
function StatusFilter({
	value,
	onChange,
}: {
	readonly value: SampleStatusValue;
	readonly onChange: (value: SampleStatusValue) => void;
}) {
	return (
		<div className="flex items-start gap-3">
			<span className="w-14 shrink-0 pt-1 font-medium text-muted-foreground text-xs">Status</span>
			<div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
				<StatusChip isActive={value === 'all'} label="All" onClick={() => onChange('all')} />
				{SAMPLE_STATUS_ORDER.map((option) => (
					<StatusChip
						color={SAMPLE_STATUS_COLORS[option]}
						isActive={value === option}
						key={option}
						label={sampleStatusLabel(option)}
						onClick={() => onChange(value === option ? 'all' : option)}
					/>
				))}
			</div>
		</div>
	);
}

function StatusChip({
	label,
	color,
	isActive,
	onClick,
}: {
	readonly label: string;
	readonly color?: string | undefined;
	readonly isActive: boolean;
	readonly onClick: () => void;
}) {
	return (
		<button
			aria-pressed={isActive}
			className={cn(
				'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
				isActive
					? 'border-primary/50 bg-primary/10 text-foreground'
					: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
			)}
			onClick={onClick}
			type="button"
		>
			{color === undefined ? null : (
				<span
					aria-hidden="true"
					className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
					style={{ backgroundColor: color }}
				/>
			)}
			{label}
		</button>
	);
}

/** The species picker, which names each species in italic the way a binomial is written. */
function SpeciesFilter({
	selected,
	onChange,
}: {
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const { options } = useSpeciesOptions();
	const [open, setOpen] = useState(false);
	const count = selected.size;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<button
					aria-label="Filter by species"
					className={cn(
						'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 font-medium text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
						count > 0
							? 'border-primary bg-primary/10 text-foreground'
							: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
					)}
					type="button"
				>
					<SpeciesIcon aria-hidden="true" className="size-3.5" />
					Species
					{count > 0 ? (
						<Badge className="px-1.5" variant="secondary">
							{count}
						</Badge>
					) : null}
					<ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<Command>
					<CommandInput placeholder="Search species…" />
					<CommandList>
						<CommandEmpty>No species in your catalog.</CommandEmpty>
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
										<span className="truncate italic">{option.label}</span>
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
