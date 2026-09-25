import type {
	LarvalDensity,
	LarvalDensityRange,
	LarvalDensityRanges,
	ResolvedLarvalInspectionEntryPolicy,
} from '@simmer-mosquito/domain';
import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { useId } from 'react';
import { densityRangeKeys } from './constants';
import { HabitatTypeLookupList } from './habitat-type-lookup';
import { densityKeyForSettings, densityLabel, formatDensityRange } from './helpers';
import { SettingChoiceCard } from './layout/setting-choice-card';

export function LarvalSurveillanceSettings({
	canManage,
	policy,
}: {
	readonly canManage: boolean;
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
}) {
	return (
		<div className="grid gap-3">
			<LarvalEntryPolicyGuide policy={policy} />
			<div className="grid gap-2">
				<h3 className={eyebrow({ tone: 'primary', className: 'mt-0.5' })}>Setup Lists</h3>
				<HabitatTypeLookupList canManage={canManage} />
			</div>
		</div>
	);
}

export function LarvalEntryPolicyGuide({
	policy,
	showDensityRanges = true,
}: {
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
	readonly showDensityRanges?: boolean;
}) {
	const id = useId();
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="grid gap-1">
				<span className="font-medium text-sm text-foreground">Inspection entry mode</span>
				<p className="m-0 text-sm leading-snug text-muted-foreground">
					This controls whether larval inspection forms collect a density category, a dip count, or
					both.
				</p>
			</div>
			<div className="grid gap-2 md:grid-cols-3">
				<SettingChoiceCard
					active={policy.mode === 'density_only'}
					description="Crews choose a density category without entering larvae counts."
					title="Density Only"
				>
					<Field className="gap-1">
						<FieldLabel htmlFor={`${id}-density`}>Density</FieldLabel>
						<Input id={`${id}-density`} disabled readOnly value="Medium" />
					</Field>
				</SettingChoiceCard>
				<SettingChoiceCard
					active={policy.mode === 'count_and_dips_required'}
					description="Crews enter larvae counts and dip counts; density can be inferred."
					title="Count and Dips Required"
				>
					<div className="grid grid-cols-2 gap-2">
						<Field className="gap-1">
							<FieldLabel htmlFor={`${id}-larvae`}>Larvae</FieldLabel>
							<Input id={`${id}-larvae`} disabled readOnly value="12" />
						</Field>
						<Field className="gap-1">
							<FieldLabel htmlFor={`${id}-dips`}>Dips</FieldLabel>
							<Input id={`${id}-dips`} disabled readOnly value="6" />
						</Field>
					</div>
				</SettingChoiceCard>
				<SettingChoiceCard
					active={policy.mode === 'hybrid'}
					description="Crews can record density, counts and dips, or both depending on the inspection."
					title="Hybrid"
				/>
			</div>
			{showDensityRanges ? <DensityRangesDisplay ranges={policy.densityRanges} /> : null}
		</section>
	);
}

function DensityRangesDisplay({ ranges }: { readonly ranges: LarvalDensityRanges | null }) {
	return (
		<SettingChoiceCard
			badge={
				<Badge tone={ranges === null ? 'neutral' : 'info'} variant="outline">
					{ranges === null ? 'Disabled' : 'Configured'}
				</Badge>
			}
			description="The app uses larvae per dip to infer density. Zero larvae is always None."
			title="Density Inference"
		>
			<div className="grid gap-2 md:grid-cols-5">
				<DensityRangeTile density="none" range={null} />
				{densityRangeKeys.map((density) => (
					<DensityRangeTile
						density={density}
						key={density}
						range={ranges?.[densityKeyForSettings(density)] ?? null}
					/>
				))}
			</div>
		</SettingChoiceCard>
	);
}

function DensityRangeTile({
	density,
	range,
}: {
	readonly density: LarvalDensity;
	readonly range: LarvalDensityRange | null;
}) {
	const label = densityLabel(density);
	return (
		<div className="grid gap-1 rounded-md border border-border/30 bg-muted/30 p-2">
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			<span className="font-medium text-sm text-foreground">
				{density === 'none' ? '0 larvae' : formatDensityRange(range)}
			</span>
		</div>
	);
}
