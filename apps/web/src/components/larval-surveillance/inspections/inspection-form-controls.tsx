import { RequiredMark } from '@simmer-mosquito/ui-web/components/form';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
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
	children,
}: {
	readonly label: string;
	readonly description?: string;
	readonly required?: boolean;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">
				{label}
				{required ? <RequiredMark /> : null}
			</span>
			{children}
			{description === undefined ? null : (
				<span className="text-muted-foreground text-xs">{description}</span>
			)}
		</div>
	);
}

export function WaterToggle({
	value,
	onChange,
}: {
	readonly value: boolean;
	readonly onChange: (value: boolean) => void;
}) {
	return (
		<ToggleGroup
			aria-label="Water state"
			className="w-full sm:w-auto"
			onValueChange={(next) => {
				if (next === 'wet' || next === 'dry') {
					onChange(next === 'wet');
				}
			}}
			size="sm"
			type="single"
			value={value ? 'wet' : 'dry'}
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
							'flex size-9 items-center justify-center font-semibold text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
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
