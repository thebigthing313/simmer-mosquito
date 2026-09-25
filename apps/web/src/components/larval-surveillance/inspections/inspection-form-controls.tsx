import { RequiredMark } from '@simmer-mosquito/ui-web/components/form';
import { FieldError } from '@simmer-mosquito/ui-web/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useId } from 'react';
import type { LifeStageFlags } from '../../larval-display';

const LIFE_STAGE_SEGMENTS: readonly {
	readonly key: keyof LifeStageFlags;
	readonly symbol: string;
	readonly label: string;
}[] = [
	{ key: 'hasEggs', symbol: 'E', label: 'Eggs' },
	{ key: 'hasFirstInstar', symbol: '1', label: '1st instar' },
	{ key: 'hasSecondInstar', symbol: '2', label: '2nd instar' },
	{ key: 'hasThirdInstar', symbol: '3', label: '3rd instar' },
	{ key: 'hasFourthInstar', symbol: '4', label: '4th instar' },
	{ key: 'hasPupae', symbol: 'P', label: 'Pupae' },
];

export function LabeledControl({
	label,
	description,
	required = false,
	error,
	errorId,
	children,
}: {
	readonly label: string;
	readonly description?: string;
	readonly required?: boolean;
	/** The field's error, drawn under the control. */
	readonly error?: string | undefined;
	/** The id the error is drawn under, for the control's `aria-describedby`. */
	readonly errorId?: string | undefined;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1.5" data-invalid={error === undefined ? undefined : true}>
			<span className="font-medium text-foreground text-sm">
				{label}
				{required ? <RequiredMark /> : null}
			</span>
			{children}
			{description === undefined ? null : (
				<span className="text-muted-foreground text-xs">{description}</span>
			)}
			{error === undefined ? null : <FieldError errors={[{ message: error }]} id={errorId} />}
		</div>
	);
}

/**
 * The Conditions field: Wet or Dry, required, with its error drawn under the
 * toggle and read with it. `null` is a new inspection nobody has looked at yet.
 */
export function ConditionsField({
	value,
	error,
	onChange,
}: {
	readonly value: boolean | null;
	readonly error: string | undefined;
	readonly onChange: (value: boolean) => void;
}) {
	const errorId = useId();
	return (
		<LabeledControl error={error} errorId={errorId} label="Conditions" required>
			<WaterToggle
				describedBy={error === undefined ? undefined : errorId}
				invalid={error !== undefined}
				onChange={onChange}
				value={value}
			/>
		</LabeledControl>
	);
}

/** What a dry inspection's findings say in place of the fields. Nothing before a choice. */
export function DryNote({ isWet }: { readonly isWet: boolean | null }) {
	if (isWet !== false) {
		return null;
	}
	return (
		<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-3 text-muted-foreground text-sm">
			Dry inspections record no abundance or life-stage detail.
		</p>
	);
}

/**
 * Wet or Dry. `null` presses neither, which is how a new inspection opens, and
 * the pressed segment cannot be pressed off again.
 */
function WaterToggle({
	value,
	onChange,
	invalid = false,
	describedBy,
}: {
	readonly value: boolean | null;
	readonly onChange: (value: boolean) => void;
	readonly invalid?: boolean;
	readonly describedBy?: string | undefined;
}) {
	return (
		<ToggleGroup
			aria-describedby={describedBy}
			aria-invalid={invalid ? true : undefined}
			aria-label="Conditions"
			className="w-full sm:w-auto"
			onValueChange={(next) => {
				if (next === 'wet' || next === 'dry') {
					onChange(next === 'wet');
				}
			}}
			size="sm"
			type="single"
			value={value === null ? '' : value ? 'wet' : 'dry'}
			variant="outline"
		>
			<ToggleGroupItem className="px-6" value="wet">
				Wet
			</ToggleGroupItem>
			<ToggleGroupItem className="px-6" value="dry">
				Dry
			</ToggleGroupItem>
		</ToggleGroup>
	);
}

export function LifeStageSelector({
	value,
	onChange,
}: {
	readonly value: LifeStageFlags;
	readonly onChange: (value: LifeStageFlags) => void;
}) {
	return (
		<div className="flex w-fit overflow-hidden rounded-md border border-border">
			{LIFE_STAGE_SEGMENTS.map((segment, index) => {
				const isOn = value[segment.key];
				return (
					<button
						aria-label={segment.label}
						aria-pressed={isOn}
						className={cn(
							'flex size-9 items-center justify-center font-semibold text-sm tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
							index > 0 && 'border-border border-l',
							isOn
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted/60',
						)}
						key={segment.key}
						onClick={() => onChange({ ...value, [segment.key]: !isOn })}
						title={segment.label}
						type="button"
					>
						{segment.symbol}
					</button>
				);
			})}
		</div>
	);
}

// --- helpers ----------------------------------------------------------------
