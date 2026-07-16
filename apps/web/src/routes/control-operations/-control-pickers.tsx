import type { HabitatRow } from '@simmer-mosquito/sync';
import { useMemo, useRef, useState } from 'react';
import { OptionRow, PickerFallback, PickerFrame } from '../../components/pickers/entity-picker';
import { habitatDisplayName } from './-control-display';

// Control actions pick an address (shared, on-demand subset search) or a habitat
// when the work was done against a known larval site. Habitats sync eagerly, so
// this filters the local set rather than querying.

export { AddressPicker } from '../../components/pickers/address-picker';

export function HabitatPicker({
	label = 'Habitat',
	habitats,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly habitats: readonly HabitatRow[];
	readonly value: string | null;
	readonly onSelect: (habitat: HabitatRow | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState(() => {
		const current = habitats.find((habitat) => habitat.id === value);
		return current === undefined ? '' : habitatDisplayName(current);
	});
	const anchorRef = useRef<HTMLDivElement>(null);

	const normalized = search.trim().toLowerCase();
	const matches = useMemo(() => {
		const active = habitats.filter((habitat) => habitat.isActive);
		const filtered =
			normalized.length === 0
				? active
				: active.filter((habitat) =>
						`${habitat.habitatName ?? ''} ${habitat.description}`
							.toLowerCase()
							.includes(normalized),
					);
		return filtered.slice(0, 8);
	}, [habitats, normalized]);

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
			{matches.length === 0 ? (
				<PickerFallback label={habitats.length === 0 ? 'No habitats yet' : 'No habitat matches'} />
			) : (
				<div className="grid gap-1">
					{matches.map((habitat) => (
						<OptionRow
							key={habitat.id}
							onSelect={() => {
								setSelectedLabel(habitatDisplayName(habitat));
								setSearch(habitatDisplayName(habitat));
								onSelect(habitat);
								setOpen(false);
							}}
							primary={habitatDisplayName(habitat)}
							secondary={habitat.description}
							selected={habitat.id === value}
						/>
					))}
				</div>
			)}
		</PickerFrame>
	);
}
