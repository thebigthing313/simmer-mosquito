import type { ControlType } from '@simmer-mosquito/domain';
import { RequiredMark } from '@simmer-mosquito/ui-web/components/form';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { CONTROL_TYPES, controlTypeLabel } from '../../hooks/queries/operations-view';

const OPTIONS = CONTROL_TYPES.map((controlType) => ({
	value: controlType,
	label: controlTypeLabel(controlType),
}));

function isControlType(value: string): value is ControlType {
	return CONTROL_TYPES.some((controlType) => controlType === value);
}

/**
 * The control-type choice, as one row of four segments. A plain controlled
 * control rather than a `field.SelectField` because picking a type has to
 * reset the method beside it, and the shared select field swallows change
 * events it cannot tell apart from a Radix option-set reset. Both operations
 * forms that carry a control type render this.
 */
export function ControlTypeToggle({
	value,
	onChange,
	description,
}: {
	readonly value: ControlType;
	readonly onChange: (next: ControlType) => void;
	readonly description?: string | undefined;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">
				Control type
				<RequiredMark />
			</span>
			<ToggleGroup
				aria-label="Control type"
				className="w-full"
				onValueChange={(next) => {
					if (isControlType(next)) {
						onChange(next);
					}
				}}
				size="sm"
				type="single"
				value={value}
				variant="outline"
			>
				{OPTIONS.map((option) => (
					<ToggleGroupItem className="flex-1 text-xs" key={option.value} value={option.value}>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			{description === undefined ? null : (
				<span className="text-muted-foreground text-xs">{description}</span>
			)}
		</div>
	);
}
