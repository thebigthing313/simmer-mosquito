import { useDeferredValue, useRef, useState } from 'react';
import { OptionRow, PickerFallback, PickerFrame } from '../../components/pickers/entity-picker';
import type { HabitatMatch } from '../../hooks/queries/habitat-view';
import { useHabitatSearch } from '../../hooks/queries/use-habitat-search';

// Control actions pick an address (shared, on-demand subset search) or a habitat
// when the work was done against a known larval site. Habitats sync on demand
// (docs/sync.md), so results come from a live `ilike` subset query rather than a
// client-side filter over an eager set.

export { AddressPicker } from '../../components/pickers/address-picker';

export function HabitatPicker({
	label = 'Habitat',
	organizationId,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (habitat: HabitatMatch | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState('');
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);

	return (
		<PickerFrame
			anchorRef={anchorRef}
			label={label}
			onClear={() => {
				setSelectedLabel('');
				setSearch('');
				onSelect(null);
			}}
			onOpen={() => setOpen(true)}
			onOpenChange={setOpen}
			onSearchChange={(next) => {
				setSearch(next);
				setOpen(true);
			}}
			open={open}
			placeholder="Search habitats"
			search={search}
			selectedLabel={selectedLabel}
			value={value}
		>
			<HabitatResults
				onSelect={(habitat) => {
					setSelectedLabel(habitat.name);
					setSearch(habitat.name);
					onSelect(habitat);
					setOpen(false);
				}}
				organizationId={organizationId}
				search={deferredSearch}
				selectedValue={value}
			/>
		</PickerFrame>
	);
}

function HabitatResults({
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
	const { matches, isReady, isError } = useHabitatSearch(organizationId, search);

	if (isError) {
		return <PickerFallback label="Habitats unavailable" />;
	}
	if (!isReady && matches.length === 0) {
		return <PickerFallback label="Searching habitats" />;
	}
	if (matches.length === 0) {
		return <PickerFallback label="No habitat matches" />;
	}

	return (
		<div className="grid gap-1">
			{matches.map((habitat) => (
				<OptionRow
					key={habitat.id}
					onSelect={() => onSelect(habitat)}
					primary={habitat.name}
					secondary={habitat.description}
					selected={habitat.id === selectedValue}
				/>
			))}
		</div>
	);
}
