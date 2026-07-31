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
import { CheckIcon, ChevronDownIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useState } from 'react';

export interface FilterOption {
	readonly id: string;
	readonly label: string;
}

/** Toggle `value` in or out of a read-only set, returning a new one. */
export function toggle<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
	const next = new Set(set);
	if (!next.delete(value)) {
		next.add(value);
	}
	return next;
}

/**
 * A searchable multi-select behind a counted trigger — the explorer's filter for
 * any set of named rows (habitat types, methods, species, personnel).
 */
export function MultiSelectFilter({
	label,
	empty,
	options,
	selected,
	onChange,
}: {
	readonly label: string;
	/** Shown when the search matches nothing. */
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
