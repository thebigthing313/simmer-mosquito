import { type RefObject, useRef, useState } from 'react';

/** The id a pick was made for and the label it showed, held as one pair. */
interface Picked {
	readonly id: string;
	readonly label: string;
}

/** The `PickerFrame` props this hook owns. The caller adds the label, placeholder, errors and rows. */
export interface SearchPickerFrame {
	readonly value: string | null;
	readonly open: boolean;
	readonly search: string;
	readonly selectedLabel: string;
	readonly anchorRef: RefObject<HTMLDivElement | null>;
	readonly onOpen: () => void;
	readonly onOpenChange: (open: boolean) => void;
	readonly onSearchChange: (search: string) => void;
	readonly onClear: () => void;
}

/**
 * The open, search and selected-label state of a search-and-pick field, as the
 * props `PickerFrame` draws, plus `pick` for a row's `onSelect`.
 *
 * Takes the field's `value`, the caller's label for that value (`''` while it
 * is unknown), and what a clear does. The closed field shows `''` for no
 * value, the picked label when `value` is the id last picked, and
 * `resolvedLabel` otherwise, read on every render. A pick that `value` does not
 * take in the same render is dropped along with its search text.
 */
export function useSearchPicker({
	value,
	resolvedLabel,
	onClear,
}: {
	readonly value: string | null;
	readonly resolvedLabel: string;
	readonly onClear: () => void;
}): {
	readonly frame: SearchPickerFrame;
	readonly search: string;
	readonly pick: (id: string, label: string) => void;
} {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [picked, setPicked] = useState<Picked | null>(null);
	const pickedId = picked?.id ?? null;
	const [seen, setSeen] = useState({ value, pickedId });
	const anchorRef = useRef<HTMLDivElement>(null);

	// A value moved from outside, or a pick the caller did not bind, drops the
	// pick and its text. A caller binding the pick sets `value` in the same event.
	if (seen.value !== value || seen.pickedId !== pickedId) {
		setSeen({ value, pickedId });
		if (value === null || value !== pickedId) {
			setSearch('');
			setPicked(null);
		}
	}

	const selectedLabel = selectedLabelFor(value, picked, resolvedLabel);

	return {
		frame: {
			value,
			open,
			search,
			selectedLabel,
			anchorRef,
			onOpen: () => setOpen(true),
			onOpenChange: setOpen,
			onSearchChange: (next) => {
				setSearch(next);
				setOpen(true);
			},
			onClear: () => {
				setPicked(null);
				setSearch('');
				onClear();
			},
		},
		search,
		pick: (id, label) => {
			setPicked({ id, label });
			setSearch(label);
			setOpen(false);
		},
	};
}

function selectedLabelFor(value: string | null, picked: Picked | null, resolvedLabel: string) {
	if (value === null) {
		return '';
	}
	return picked !== null && picked.id === value ? picked.label : resolvedLabel;
}
