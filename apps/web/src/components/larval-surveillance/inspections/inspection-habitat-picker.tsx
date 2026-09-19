import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { InputGroupButton } from '@simmer-mosquito/ui-web/components/ui/input-group';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { CheckIcon, SearchIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useDeferredValue, useRef, useState } from 'react';
import { useHabitatLabel } from '../../../hooks/larval-surveillance/use-habitat-label';
import type { HabitatMatch } from '../../../hooks/queries/habitat-view';
import { useHabitatSearch } from '../../../hooks/queries/use-habitat-search';
import { LabeledControl } from './inspection-form-controls';

/**
 * The habitat an inspection is already recorded against, as a read-only line.
 *
 * A picker here would offer a change the update command drops: an inspection's
 * habitat, and the type/address/geometry snapshotted from it, are fixed once
 * recorded.
 */
export function SelectedHabitat({ habitatId }: { readonly habitatId: string | null }) {
	const name = useHabitatLabel(habitatId);

	return (
		<LabeledControl label="Habitat">
			<div className="flex min-h-9 w-full items-center rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-foreground text-sm">
				{name === '' ? <span className="text-muted-foreground">Loading habitat…</span> : name}
			</div>
		</LabeledControl>
	);
}

export function HabitatPicker({
	organizationId,
	value,
	onSelect,
}: {
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (habitat: HabitatMatch | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [pickedLabel, setPickedLabel] = useState('');
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);
	// A value can arrive without a pick — a stop's "Record inspection" seeds the
	// habitat it was sent to — and then there is no label to show. Resolving it
	// from the id covers both routes in; the picked label still wins so typing
	// never flickers against a query.
	const seededLabel = useHabitatLabel(pickedLabel === '' ? value : null);
	const selectedLabel = pickedLabel === '' ? seededLabel : pickedLabel;

	return (
		<LabeledControl label="Habitat" required>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverAnchor asChild>
					<div ref={anchorRef}>
						<SearchInput
							/*
							 * The trailing control clears the picked habitat, not the text, so
							 * it is this form's own addon and shows against the selection
							 * rather than against what is typed.
							 */
							endAddon={
								value === null ? null : (
									<InputGroupButton
										aria-label="Clear habitat"
										onClick={() => {
											setPickedLabel('');
											setSearch('');
											onSelect(null);
										}}
										size="icon-xs"
									>
										<XIcon aria-hidden="true" />
									</InputGroupButton>
								)
							}
							label="Search habitats"
							onChange={(event) => {
								setSearch(event.target.value);
								setOpen(true);
							}}
							onFocus={() => setOpen(true)}
							placeholder="Search habitats"
							value={open ? search : selectedLabel}
						/>
					</div>
				</PopoverAnchor>
				<PopoverContent
					align="start"
					className="grid w-(--radix-popover-trigger-width) min-w-80 gap-2 p-2"
					onInteractOutside={(event) => {
						const target = event.detail.originalEvent.target as Node | null;
						if (target !== null && anchorRef.current?.contains(target)) {
							event.preventDefault();
						}
					}}
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					<HabitatSearchResults
						onSelect={(habitat) => {
							setPickedLabel(habitat.name);
							setSearch(habitat.name);
							onSelect(habitat);
							setOpen(false);
						}}
						organizationId={organizationId}
						search={deferredSearch}
						selectedValue={value}
					/>
				</PopoverContent>
			</Popover>
		</LabeledControl>
	);
}

function HabitatSearchResults({
	organizationId,
	search,
	selectedValue,
	onSelect,
}: {
	readonly organizationId: string;
	readonly search: string;
	readonly selectedValue: string | null;
	readonly onSelect: (habitat: HabitatMatch) => void;
}) {
	// `includeRetired`, because this picker always has: an inspection is also how
	// a site the organization retired gets looked at again. The control pickers
	// exclude.
	const {
		matches: habitats,
		isReady,
		isError,
	} = useHabitatSearch(organizationId, search, { includeRetired: true });

	if (isError) {
		return <SearchFallback label="Habitats unavailable" />;
	}
	if (!isReady && habitats.length === 0) {
		return <SearchFallback label="Searching habitats" />;
	}
	if (habitats.length === 0) {
		return <SearchFallback label="No habitat matches" />;
	}

	return (
		<div className="grid gap-1">
			{habitats.map((habitat) => (
				<button
					className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
					key={habitat.id}
					onClick={() => onSelect(habitat)}
					type="button"
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium">{habitat.name}</span>
						{habitat.description.trim().length === 0 ? null : (
							<span className="block truncate text-muted-foreground text-xs">
								{habitat.description}
							</span>
						)}
					</span>
					{habitat.id === selectedValue ? <CheckIcon aria-hidden="true" /> : null}
				</button>
			))}
		</div>
	);
}

function SearchFallback({ label }: { readonly label: string }) {
	return (
		<div className="flex min-h-16 items-center justify-center gap-2 rounded-md bg-muted/50 text-muted-foreground text-sm">
			<SearchIcon aria-hidden="true" />
			{label}
		</div>
	);
}
