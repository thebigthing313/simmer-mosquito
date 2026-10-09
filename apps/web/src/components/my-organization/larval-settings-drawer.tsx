import type { OrganizationSettings, RangeDensity } from '@simmer-mosquito/domain';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { useId } from 'react';
import { useOrganizationSettingsMutations } from '../../hooks/mutations/use-organization-settings-mutations';
import type { SettingsSheetForm } from '../../hooks/my-organization/use-settings-sheet';
import { densityRangeKeys, larvalEntryModeOptions } from './constants';
import {
	densityLabel,
	larvalEntryPolicyFrom,
	larvalSettingsFormValues,
	safeDensityRangesFromFormValues,
} from './helpers';
import { LarvalEntryPolicyGuide } from './larval';
import { SettingsSheet } from './layout/settings-sheet';
import type { LarvalSettingsFormValues } from './types';

type LarvalSettingsForm = SettingsSheetForm<LarvalSettingsFormValues>;

/**
 * The larval surveillance sheet: the inspection entry mode with a preview of
 * what it asks crews for, and the optional density bands in larvae per dip.
 */
export function LarvalSettingsDrawer({
	canManage,
	settings,
}: {
	readonly canManage: boolean;
	readonly settings: OrganizationSettings;
}) {
	const { canWrite, setLarvalInspectionEntryPolicy } = useOrganizationSettingsMutations();

	return (
		<SettingsSheet
			canSave={canManage && canWrite}
			convert={larvalEntryPolicyFrom}
			description="Adjust inspection entry rules and optional density inference ranges."
			failureMessage="Unable to save larval settings."
			title="Edit Larval Surveillance"
			values={larvalSettingsFormValues(settings.larvalSurveillance.inspectionEntryPolicy)}
			width="wide"
			write={setLarvalInspectionEntryPolicy}
		>
			{(form) => (
				<>
					<form.AppField name="mode">
						{(field) => (
							<field.SelectField
								disabled={!canManage}
								label="Entry mode"
								options={larvalEntryModeOptions}
							/>
						)}
					</form.AppField>
					<form.Subscribe selector={(state) => state.values}>
						{(values) => (
							<LarvalEntryPolicyGuide
								policy={{
									mode: values.mode,
									densityRanges: values.densityEnabled
										? safeDensityRangesFromFormValues(values.ranges)
										: null,
								}}
								showDensityRanges={false}
							/>
						)}
					</form.Subscribe>
					<DensityRangesEditor canManage={canManage} form={form} />
				</>
			)}
		</SettingsSheet>
	);
}

function DensityRangesEditor({
	canManage,
	form,
}: {
	readonly canManage: boolean;
	readonly form: LarvalSettingsForm;
}) {
	const id = useId();

	return (
		<div className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<form.AppField name="densityEnabled">
				{(field) => (
					<div className="flex items-center justify-between gap-3">
						<div>
							<Label htmlFor={`${id}-density`} className="text-foreground">
								Density inference ranges
							</Label>
							<p
								id={`${id}-density-description`}
								className="m-0 text-xs leading-snug text-muted-foreground"
							>
								Configure larvae per dip ranges for inferred densities.
							</p>
						</div>
						<Switch
							id={`${id}-density`}
							aria-describedby={`${id}-density-description`}
							checked={field.state.value}
							disabled={!canManage}
							onCheckedChange={(checked) => field.handleChange(checked)}
						/>
					</div>
				)}
			</form.AppField>
			<form.Subscribe selector={(state) => state.values.densityEnabled}>
				{(densityEnabled) => (
					<div className="grid gap-2 md:grid-cols-2">
						{densityRangeKeys.map((density) => (
							<DensityRangeEditor
								density={density}
								disabled={!canManage || !densityEnabled}
								form={form}
								key={density}
							/>
						))}
					</div>
				)}
			</form.Subscribe>
		</div>
	);
}

function DensityRangeEditor({
	density,
	disabled,
	form,
}: {
	readonly density: RangeDensity;
	readonly disabled: boolean;
	readonly form: LarvalSettingsForm;
}) {
	const id = useId();
	// Four editors draw the same two field labels, so each is a fieldset named for
	// its density band. The legend floats so it lays out as a grid item rather than
	// sitting on the fieldset border.
	return (
		<fieldset className="grid min-w-0 gap-2 rounded-md border border-border/30 bg-background p-2.5">
			<legend className="float-left font-medium text-sm text-foreground">
				{densityLabel(density)}
			</legend>
			<div className="grid grid-cols-2 gap-2">
				<form.AppField name={`ranges.${density}.minInclusive`}>
					{(field) => (
						<Field className="gap-1">
							<FieldLabel htmlFor={`${id}-min`}>Greater than</FieldLabel>
							<Input
								id={`${id}-min`}
								disabled={disabled || density === 'light'}
								min={0}
								onChange={(event) => field.handleChange(event.target.value)}
								type="number"
								value={density === 'light' ? '0' : field.state.value}
							/>
						</Field>
					)}
				</form.AppField>
				<form.AppField name={`ranges.${density}.maxExclusive`}>
					{(field) => (
						<Field className="gap-1">
							<FieldLabel htmlFor={`${id}-max`}>Up to and including</FieldLabel>
							<Input
								id={`${id}-max`}
								disabled={disabled || density === 'very_heavy'}
								min={0}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder={density === 'very_heavy' ? 'No limit' : undefined}
								type="number"
								value={density === 'very_heavy' ? '' : field.state.value}
							/>
						</Field>
					)}
				</form.AppField>
			</div>
		</fieldset>
	);
}
