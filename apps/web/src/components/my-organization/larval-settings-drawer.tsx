import type {
	LarvalInspectionEntryMode,
	OrganizationSettings,
	RangeDensity,
} from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@simmer-mosquito/ui-web/components/ui/sheet';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { useId, useState } from 'react';
import { useOrganizationSettingsMutations } from '../../hooks/mutations/use-organization-settings-mutations';
import { errorMessageForSave } from '../../lib/save-error';
import {
	CloseIcon,
	densityRangeKeys,
	EditIcon,
	larvalEntryModeOptions,
	SaveIcon,
} from './constants';
import {
	densityLabel,
	densityRangeFormValues,
	densityRangesOrNull,
	safeDensityRangesFromFormValues,
	watchWrite,
} from './helpers';
import { LarvalEntryPolicyGuide } from './larval';
import type { DensityRangeFormValue, DensityRangeFormValues } from './types';

export function LarvalSettingsDrawer({
	canManage,
	settings,
}: {
	readonly canManage: boolean;
	readonly settings: OrganizationSettings;
}) {
	const id = useId();
	const { canWrite, setLarvalInspectionEntryPolicy } = useOrganizationSettingsMutations();
	const policy = settings.larvalSurveillance.inspectionEntryPolicy;
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<LarvalInspectionEntryMode>(policy.mode);
	const [densityEnabled, setDensityEnabled] = useState(policy.densityRanges !== null);
	const [ranges, setRanges] = useState<DensityRangeFormValues>(() =>
		densityRangeFormValues(policy.densityRanges),
	);
	const [error, setError] = useState<string | null>(null);
	const previewDensityRanges = densityEnabled ? safeDensityRangesFromFormValues(ranges) : null;

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setMode(policy.mode);
			setDensityEnabled(policy.densityRanges !== null);
			setRanges(densityRangeFormValues(policy.densityRanges));
			setError(null);
		}
		setOpen(nextOpen);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			// Built before the sheet closes: an out-of-order density band throws here,
			// and a save that never left should not look like one that did.
			const policyToSave = {
				mode,
				densityRanges: densityRangesOrNull(densityEnabled, ranges),
			};
			setOpen(false);
			watchWrite(setLarvalInspectionEntryPolicy(policyToSave), 'Unable to save larval settings.');
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		}
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(680px,100%)] sm:max-w-[680px]">
				<SheetHeader>
					<SheetTitle>Edit Larval Surveillance</SheetTitle>
					<SheetDescription>
						Adjust inspection entry rules and optional density inference ranges.
					</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5 px-4" onSubmit={submit}>
					<Field className="min-w-0 gap-1">
						<FieldLabel htmlFor={`${id}-entry-mode`}>Entry mode</FieldLabel>
						<Select
							value={mode}
							disabled={!canManage}
							onValueChange={(value) => setMode(value as LarvalInspectionEntryMode)}
						>
							<SelectTrigger id={`${id}-entry-mode`} size="sm" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{larvalEntryModeOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<LarvalEntryPolicyGuide
						policy={{ mode, densityRanges: previewDensityRanges }}
						showDensityRanges={false}
					/>
					<div className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
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
								checked={densityEnabled}
								disabled={!canManage}
								onCheckedChange={setDensityEnabled}
							/>
						</div>
						<div className="grid gap-2 md:grid-cols-2">
							{densityRangeKeys.map((density) => (
								<DensityRangeEditor
									disabled={!canManage || !densityEnabled}
									key={density}
									density={density}
									value={ranges[density]}
									onChange={(value) => setRanges({ ...ranges, [density]: value })}
								/>
							))}
						</div>
					</div>
					{error === null ? null : (
						<p role="alert" className="m-0 text-sm leading-snug text-destructive">
							{error}
						</p>
					)}
					<SheetFooter className="px-0">
						<Button type="submit" disabled={!canManage || !canWrite}>
							<SaveIcon aria-hidden="true" />
							Save Changes
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								<CloseIcon data-icon="inline-start" aria-hidden="true" />
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function DensityRangeEditor({
	density,
	disabled,
	onChange,
	value,
}: {
	readonly density: RangeDensity;
	readonly disabled: boolean;
	readonly onChange: (value: DensityRangeFormValue) => void;
	readonly value: DensityRangeFormValue;
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
				<Field className="gap-1">
					<FieldLabel htmlFor={`${id}-min`}>Greater than</FieldLabel>
					<Input
						id={`${id}-min`}
						disabled={disabled || density === 'light'}
						min={0}
						onChange={(event) => onChange({ ...value, minInclusive: event.target.value })}
						type="number"
						value={density === 'light' ? '0' : value.minInclusive}
					/>
				</Field>
				<Field className="gap-1">
					<FieldLabel htmlFor={`${id}-max`}>Up to and including</FieldLabel>
					<Input
						id={`${id}-max`}
						disabled={disabled || density === 'very_heavy'}
						min={0}
						onChange={(event) => onChange({ ...value, maxExclusive: event.target.value })}
						placeholder={density === 'very_heavy' ? 'No limit' : undefined}
						type="number"
						value={density === 'very_heavy' ? '' : value.maxExclusive}
					/>
				</Field>
			</div>
		</fieldset>
	);
}
