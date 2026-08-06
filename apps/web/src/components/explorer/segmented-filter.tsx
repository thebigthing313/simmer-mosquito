import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';

/**
 * A filter with a small, fixed set of mutually exclusive values, laid out as
 * one labelled row of segments.
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
		<div className="flex items-center gap-3">
			<span className="w-12 shrink-0 font-medium text-muted-foreground text-xs">{label}</span>
			<ToggleGroup
				aria-label={label}
				className="flex-1"
				onValueChange={(next) => {
					if (next) {
						onChange(next as T);
					}
				}}
				size="sm"
				type="single"
				value={value}
				variant="outline"
			>
				{options.map((option) => (
					<ToggleGroupItem className="flex-1 text-xs" key={option.value} value={option.value}>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}
