import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { isCollectionDurationUnitType } from '@simmer-mosquito/domain';
import { FormSection } from '@simmer-mosquito/ui-web/components/form';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { unitOptions } from '../../../lib/unit-options';
import { DateControl } from '../../date-control';
import { type CollectionFormValues, isPendingCollectionDraft } from './collection-form-values';

export function TimingSection({
	form,
	units,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly units: readonly UnitLabel[];
}) {
	// A date-plus-duration collection is saying how long the trap ran, so the only
	// units that carry meaning are times.
	const durationUnitOptions = unitOptions(units, isCollectionDurationUnitType);

	return (
		<FormSection title="Timing">
			<form.AppField name="timingMode">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<ToggleGroup
						aria-label="Timing mode"
						className="w-full"
						onValueChange={(next: string) => {
							if (next === 'exact_timestamps' || next === 'collection_date_duration') {
								field.handleChange(next);
							}
						}}
						size="sm"
						type="single"
						value={field.state.value}
						variant="outline"
					>
						<ToggleGroupItem className="flex-1 text-xs" value="exact_timestamps">
							Set &amp; collected dates
						</ToggleGroupItem>
						<ToggleGroupItem className="flex-1 text-xs" value="collection_date_duration">
							Date &amp; duration
						</ToggleGroupItem>
					</ToggleGroup>
				)}
			</form.AppField>

			<form.Subscribe
				selector={(state: { values: CollectionFormValues }) => ({
					timingMode: state.values.timingMode,
					// Which of the two dates is the required one swaps with this, so the
					// section has to re-render when it changes and not only on the mode.
					pending: isPendingCollectionDraft(state.values),
				})}
			>
				{({ timingMode, pending }: { timingMode: AdultCollectionTimingMode; pending: boolean }) =>
					timingMode === 'exact_timestamps' ? (
						<div className="grid gap-5 sm:grid-cols-2">
							<form.AppField name="startedAt">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<DateControl
										label="Set date"
										onChange={(next: string) => field.handleChange(next === '' ? null : next)}
										required={pending}
										value={field.state.value}
									/>
								)}
							</form.AppField>
							<form.AppField name="collectedAt">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<DateControl
										// Left empty, the trap is still out and the collection is
										// saved pending, to be emptied on a later visit.
										label="Collected date"
										onChange={(next: string) => field.handleChange(next === '' ? null : next)}
										value={field.state.value}
									/>
								)}
							</form.AppField>
						</div>
					) : (
						<div className="grid gap-5 sm:grid-cols-3">
							<form.AppField name="collectionDate">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<DateControl
										label="Collection date"
										required
										onChange={(next: string) => field.handleChange(next === '' ? null : next)}
										value={field.state.value}
									/>
								)}
							</form.AppField>
							<form.AppField name="durationAmount">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<field.NumberField label="Duration" min={0} placeholder="e.g. 1" />
								)}
							</form.AppField>
							<form.AppField name="durationUnitId">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<field.SelectField
										label="Unit"
										options={durationUnitOptions}
										placeholder="Select a unit"
										required
									/>
								)}
							</form.AppField>
						</div>
					)
				}
			</form.Subscribe>
		</FormSection>
	);
}
