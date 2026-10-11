import { useSearchPicker } from '../../hooks/pickers/use-search-picker';
import { type TrapName, trapDisplayName } from '../../hooks/queries/trap-view';
import { OptionRow, PickerFallback, PickerFrame } from '../pickers/entity-picker';

// The trap picker searches the eager `traps` set client-side, over whatever set
// the caller handed it. Picking an address is `LocationAddressField`'s, in
// `components/forms/location-band.tsx`, because that pick also moves the map.

/**
 * The three things this picker reads off a trap. Structural rather than
 * `TrapRow`, and the component is generic over it, so `onSelect` hands back
 * whatever shape the caller passed. Which traps are pickable is the caller's
 * question; see the search below.
 */
export interface PickableTrap extends TrapName {
	readonly description: string | null;
}

/** The first eight traps whose display name holds the search, or the first eight. */
function trapMatches<TTrap extends PickableTrap>(
	traps: readonly TTrap[],
	normalized: string,
): readonly TTrap[] {
	const filtered =
		normalized.length === 0
			? traps
			: traps.filter((trap) => trapDisplayName(trap).toLowerCase().includes(normalized));
	return filtered.slice(0, 8);
}

export function TrapPicker<TTrap extends PickableTrap>({
	label = 'Trap',
	traps,
	value,
	onSelect,
	errors,
}: {
	readonly label?: string;
	readonly traps: readonly TTrap[];
	readonly value: string | null;
	readonly onSelect: (trap: TTrap | null) => void;
	/** The bound field's `state.meta.errors`, drawn under the input. */
	readonly errors?: readonly unknown[] | undefined;
}) {
	const current = traps.find((trap) => trap.id === value);
	const picker = useSearchPicker({
		value,
		resolvedLabel: current === undefined ? '' : trapDisplayName(current),
		onClear: () => onSelect(null),
	});

	const normalized = picker.search.trim().toLowerCase();
	// Every trap the caller passed, retired ones included. Callers that plan
	// future work pass `useActiveTraps`; the collection form passes
	// `useTrapOptions`, because a trap retired yesterday still needs last week's
	// collection recorded.
	const matches = trapMatches(traps, normalized);

	return (
		<PickerFrame {...picker.frame} errors={errors} label={label} placeholder="Search traps">
			{matches.length === 0 ? (
				<PickerFallback label={traps.length === 0 ? 'No traps yet' : 'No trap matches'} />
			) : (
				<div className="grid gap-1">
					{matches.map((trap) => (
						<OptionRow
							key={trap.id}
							onSelect={() => {
								picker.pick(trap.id, trapDisplayName(trap));
								onSelect(trap);
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
