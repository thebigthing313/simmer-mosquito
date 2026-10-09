import { useDeferredValue } from 'react';
import { useSearchPicker } from '../../hooks/pickers/use-search-picker';
import type { HabitatMatch } from '../../hooks/queries/habitat-view';
import { useHabitatNames } from '../../hooks/queries/use-habitat-names';
import { useHabitatSearch } from '../../hooks/queries/use-habitat-search';
import { OptionRow, PickerFallback, PickerFrame } from '../pickers/entity-picker';

// A control action picks a habitat when the work was done against a known
// larval site. Habitats sync on demand, so results come from a live `ilike`
// subset query. Picking an address is `LocationAddressField`'s, in
// `components/forms/location-band.tsx`, because that pick also moves the map.

export function HabitatPicker({
	label = 'Habitat',
	organizationId,
	value,
	onSelect,
	errors,
}: {
	readonly label?: string;
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (habitat: HabitatMatch | null) => void;
	/** The bound field's `state.meta.errors`, drawn under the input. */
	readonly errors?: readonly unknown[] | undefined;
}) {
	/*
	 * A habitat this picker did not pick still has to say its name: a form opened
	 * on a record already holding one, or a create form seeded from the habitat's
	 * page. Habitats sync on demand, so the name is a subset read, made for any
	 * value because whether the picked name stands over it is the hook's rule.
	 */
	const names = useHabitatNames(value === null ? [] : [value]);
	const picker = useSearchPicker({
		value,
		resolvedLabel: names.get(value ?? '') ?? '',
		onClear: () => onSelect(null),
	});
	const deferredSearch = useDeferredValue(picker.search);

	return (
		<PickerFrame {...picker.frame} errors={errors} label={label} placeholder="Search habitats">
			<HabitatResults
				onSelect={(habitat) => {
					picker.pick(habitat.id, habitat.name);
					onSelect(habitat);
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
