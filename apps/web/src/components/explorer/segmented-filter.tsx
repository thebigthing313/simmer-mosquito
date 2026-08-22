import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { FilterLabel } from './filter-layout';

/**
 * A filter with a small, fixed set of mutually exclusive values, laid out as a
 * named, full-width row of segments.
 *
 * The name sits above the options rather than in a gutter beside them. A gutter
 * gave the panel three left edges — the search box at one, the segments at
 * another, the popover filters at a third — and it was sized for "Status" while
 * the labels next to it ran to "Habitat type". Above, the segments get the whole
 * width, which is what lets an option read at the same size as the rest of the
 * panel instead of being shrunk to fit beside its own label.
 *
 * The group is single-select and always has a value: `onValueChange` fires with
 * an empty string when the pressed segment is pressed again, which is ignored
 * so a filter can never end up in a state that means nothing.
 */
export function SegmentedFilter<T extends string>({
	label,
	value,
	onChange,
	options,
}: {
	readonly label: string;
	readonly value: T;
	readonly onChange: (value: T) => void;
	readonly options: readonly { readonly value: T; readonly label: string }[];
}) {
	return (
		<div className="grid gap-1.5">
			<FilterLabel>{label}</FilterLabel>
			<ToggleGroup
				aria-label={label}
				className="w-full"
				onValueChange={(next) => {
					if (next) {
						onChange(next as T);
					}
				}}
				type="single"
				value={value}
				variant="outline"
			>
				{options.map((option) => (
					<ToggleGroupItem className="flex-1" key={option.value} value={option.value}>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}
