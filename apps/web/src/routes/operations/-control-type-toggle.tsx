import type { ControlType } from '@simmer-mosquito/sync';
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
 * The control-type choice, as one row of four segments.
 *
 * A toggle rather than a select because there are exactly four and they are the
 * first decision on the form. It is a plain controlled control rather than a
 * `field.SelectField` because picking a type has to reset the method beside it —
 * the method id is polymorphic by type, so one chosen for the old type points at
 * the wrong catalog — and the shared select field deliberately swallows change
 * events it cannot tell apart from a Radix option-set reset.
 *
 * Both operations forms that carry a control type render this: a request says
 * what kind of work a site needs, a mission says what kind its crew will do, and
 * the control is the same in both.
 */
export function ControlTypeToggle({
	value,
	onChange,
	description,
}: {
	readonly value: ControlType;
	readonly onChange: (next: ControlType) => void;
	readonly description: string;
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
			<span className="text-muted-foreground text-xs">{description}</span>
		</div>
	);
}
