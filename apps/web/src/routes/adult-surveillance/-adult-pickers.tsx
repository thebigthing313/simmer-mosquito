import type { TrapRow } from '@simmer-mosquito/sync';
import { useMemo, useRef, useState } from 'react';
import { OptionRow, PickerFallback, PickerFrame } from '../../components/pickers/entity-picker';
import { trapDisplayName } from './-adult-display';

// The adult forms pick an address (shared, on-demand subset search) or a trap.
// The trap picker filters the eager `traps` set client-side.

export { AddressPicker } from '../../components/pickers/address-picker';

export function TrapPicker({
	label = 'Trap',
	traps,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly traps: readonly TrapRow[];
	readonly value: string | null;
	readonly onSelect: (trap: TrapRow | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState(() => {
		const current = traps.find((trap) => trap.id === value);
		return current === undefined ? '' : trapDisplayName(current);
	});
	const anchorRef = useRef<HTMLDivElement>(null);

	const normalized = search.trim().toLowerCase();
	const matches = useMemo(() => {
		const active = traps.filter((trap) => trap.isActive);
		const filtered =
			normalized.length === 0
				? active
				: active.filter((trap) =>
						`${trap.trapName ?? ''} ${trap.trapCode ?? ''}`.toLowerCase().includes(normalized),
					);
		return filtered.slice(0, 8);
	}, [traps, normalized]);

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
			placeholder="Search traps"
			search={search}
			selectedLabel={selectedLabel}
			value={value}
		>
			{matches.length === 0 ? (
				<PickerFallback label={traps.length === 0 ? 'No traps yet' : 'No trap matches'} />
			) : (
				<div className="grid gap-1">
					{matches.map((trap) => (
						<OptionRow
							key={trap.id}
							onSelect={() => {
								setSelectedLabel(trapDisplayName(trap));
								setSearch(trapDisplayName(trap));
								onSelect(trap);
								setOpen(false);
							}}
							primary={trapDisplayName(trap)}
							secondary={trap.description}
							selected={trap.id === value}
						/>
					))}
				</div>
			)}
		</PickerFrame>
	);
}
