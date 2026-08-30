import { useMemo, useRef, useState } from 'react';
import { OptionRow, PickerFallback, PickerFrame } from '../../components/pickers/entity-picker';
import { type TrapName, trapDisplayName } from '../../hooks/queries/trap-view';

// The adult forms pick an address (shared, on-demand subset search) or a trap.
// The trap picker searches the eager `traps` set client-side, over whatever set
// the caller handed it.

export { AddressPicker } from '../../components/pickers/address-picker';

/**
 * The three things this picker reads off a trap.
 *
 * Structural rather than `TrapRow`, and the component is generic over it, so a
 * caller holding a query hook's projection can pass that and get the same shape
 * back from `onSelect`. A caller still holding the full row passes that instead —
 * it satisfies this — and its `onSelect` still receives a whole trap.
 *
 * `is_active` is not among them: which traps are pickable is the caller's
 * question, not this component's. See the search below.
 */
export interface PickableTrap extends TrapName {
	readonly description: string | null;
}

export function TrapPicker<TTrap extends PickableTrap>({
	label = 'Trap',
	traps,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly traps: readonly TTrap[];
	readonly value: string | null;
	readonly onSelect: (trap: TTrap | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState(() => {
		const current = traps.find((trap) => trap.id === value);
		return current === undefined ? '' : trapDisplayName(current);
	});
	const anchorRef = useRef<HTMLDivElement>(null);

	const normalized = search.trim().toLowerCase();
	// Every trap the caller passed, retired ones included. A trap retired
	// yesterday still needs last week's collection recorded, and this picker used
	// to be the one place that refused: the collection form seeds a retired trap
	// from a trap page and shows it, but clearing the field could not get it back.
	//
	// The caller decides instead, and the two that plan future work already do —
	// the route editor and the assignment target picker both pass
	// `useActiveTraps`, which excludes retired traps in its predicate. The
	// collection form passes `useTrapOptions`, which carries them. The habitat
	// picker on the inspection form settles the same question the same way, and
	// marks nothing in the list, so neither does this.
	const matches = useMemo(() => {
		const filtered =
			normalized.length === 0
				? traps
				: traps.filter((trap) => trapDisplayName(trap).toLowerCase().includes(normalized));
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
