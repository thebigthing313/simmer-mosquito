/**
 * The sample filters, drawn the same way on the Samples Map and the Samples
 * Table: the date window, Status, the species, region and non-mosquito
 * filters, and the chips for whatever is set. It returns the blocks bare, so
 * each surface puts them in its own frame. Takes the binding from
 * `useSampleFilterState`.
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
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { useSpeciesOptions } from '../../../hooks/explorer/use-species-options';
import type { SampleFilterBinding } from '../../../hooks/larval-surveillance/use-sample-filter-state';
import { dateRangeLabel } from '../../../lib/local-date';
import { DateRangeFilter } from '../../date-range-filter';
import {
	ActiveFilterBar,
	FilterChip,
	FilterFieldsLayout,
	FilterGrid,
	MultiSelectFilter,
	ToggleFilter,
	toggle,
} from '../../explorer';
import { SAMPLE_STATUS_COLORS } from '../../map';
import type { SampleStatusValue } from '../samples-search';
import { SAMPLE_STATUS_ORDER, sampleStatusLabel } from './legend';

const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

export function SampleFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: SampleFilterBinding;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const { filters, setFilters, reset, activeCount, defaults, today } = binding;
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });
	const { nameById, options } = useSpeciesOptions();
	const regions = useRegionOptions();
	const isDefaultRange = filters.from === defaults.from && filters.to === defaults.to;
	const status = filters.status;

	const popovers = (
		<div className="grid gap-3">
			<StatusFilter onChange={(next) => setFilters({ status: next })} value={status} />

			<FilterGrid>
				<SpeciesFilter
					onChange={(species) => setFilters({ species })}
					options={options}
					selected={filters.species}
				/>
				<MultiSelectFilter
					empty="No regions"
					label="Region"
					onChange={(regionIds) => setFilters({ regions: regionIds })}
					options={regions.options}
					selected={filters.regions}
				/>
				<ToggleFilter
					label="Non-mosquito material"
					onChange={(nonMosquito) => setFilters({ nonMosquito })}
					value={filters.nonMosquito}
				/>
			</FilterGrid>
		</div>
	);

	const chips =
		activeCount === 0 ? null : (
			<ActiveFilterBar onClearAll={reset}>
				{isDefaultRange ? null : (
					<FilterChip
						label={`Dates: ${dateRangeLabel(filters.from, filters.to)}`}
						onRemove={() => setFilters({ from: defaults.from, to: defaults.to })}
					/>
				)}
				{status === 'all' ? null : (
					<FilterChip
						color={SAMPLE_STATUS_COLORS[status]}
						label={sampleStatusLabel(status)}
						onRemove={() => setFilters({ status: 'all' })}
					/>
				)}
				{[...filters.species].map((id) => (
					<FilterChip
						italic
						key={`species-${id}`}
						label={nameById.get(id) ?? 'Unknown species'}
						onRemove={() => setFilters({ species: toggle(filters.species, id) })}
					/>
				))}
				{[...filters.regions].map((id) => (
					<FilterChip
						key={`region-${id}`}
						label={regions.nameById.get(id) ?? 'Unknown region'}
						onRemove={() => setFilters({ regions: toggle(filters.regions, id) })}
					/>
				))}
				{filters.nonMosquito ? (
					<FilterChip
						label="Non-mosquito material"
						onRemove={() => setFilters({ nonMosquito: false })}
					/>
				) : null}
			</ActiveFilterBar>
		);

	return (
		<FilterFieldsLayout
			chips={chips}
			controls={<DateRangeFilter {...dateRange} />}
			popovers={popovers}
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
				'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

interface SpeciesOption {
	readonly id: string;
	readonly label: string;
}

function SpeciesFilter({
	options,
	selected,
	onChange,
}: {
	readonly options: readonly SpeciesOption[];
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const [open, setOpen] = useState(false);
	const count = selected.size;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<button
					aria-label="Filter by species"
					className={cn(
						'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
