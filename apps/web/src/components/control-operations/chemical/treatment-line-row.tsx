import type { FieldOption } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import type { InsecticideListing } from '../../../hooks/queries/chemical-roster-view';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { formatAmountWithUnit } from './formulation-math';
import { InsecticideBatchOptions } from './insecticide-batch-options';
import type { TreatmentForm } from './treatment-form-values';
import { lineFieldName, productLabel, type TreatmentLineValue } from './treatment-line-values';

/** Why Remove is off on the last live row. */
export const keepOneProductLabel = 'A treatment keeps at least one product';

/**
 * One numbered product row: the Insecticide, then the amount and unit, then
 * the batches. `locked` draws the product, amount and unit as text, derived
 * from a Formulation's recipe, and leaves only the batches to edit. Takes the
 * form, the row's index in `lines`, its number among the live rows, and the
 * options each field offers.
 */
export function TreatmentLineRow({
	form,
	index,
	number,
	line,
	locked,
	canRemove,
	insecticides,
	insecticideOptions,
	units,
	unitOptionsFor,
	onRemove,
}: {
	readonly form: TreatmentForm;
	readonly index: number;
	readonly number: number;
	readonly line: TreatmentLineValue;
	readonly locked: boolean;
	readonly canRemove: boolean;
	readonly insecticides: readonly InsecticideListing[];
	readonly insecticideOptions: readonly FieldOption[];
	readonly units: readonly UnitLabel[];
	readonly unitOptionsFor: (insecticideId: string) => readonly FieldOption[];
	readonly onRemove: () => void;
}) {
	const unit = units.find((row) => row.id === line.unitId);
	return (
		<li className="grid gap-3 border-border border-t px-3 py-3 first:border-t-0">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium text-muted-foreground text-xs tabular-nums">
					Product {number}
				</span>
				{locked ? null : (
					<Button
						disabled={!canRemove}
						onClick={onRemove}
						size="xs"
						title={canRemove ? undefined : keepOneProductLabel}
						type="button"
						variant="ghost"
					>
						Remove
					</Button>
				)}
			</div>

			{locked ? (
				<form.AppField name={lineFieldName(index, 'insecticideId')}>
					{(field) => (
						<div className="grid gap-1">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<span className="font-medium text-sm">
									{productLabel(insecticides, line.insecticideId)}
								</span>
								<span className="text-sm tabular-nums">
									{line.amount === null
										? 'Enter the mix total'
										: formatAmountWithUnit(line.amount, unit)}
								</span>
							</div>
							<RowErrors errors={field.state.meta.errors} />
						</div>
					)}
				</form.AppField>
			) : (
				<>
					<form.AppField name={lineFieldName(index, 'insecticideId')}>
						{(field) => (
							<field.AutocompleteField
								emptyValue=""
								label="Insecticide"
								required
								onValueChange={(next, previousValue) => {
									if (next === previousValue) {
										return;
									}
									const chosen = insecticides.find((row) => row.id === next);
									form.setFieldValue(lineFieldName(index, 'unitId'), chosen?.defaultUnitId ?? '');
									// Lots belong to one product, so a new product starts them over.
									form.setFieldValue(lineFieldName(index, 'batchIds'), []);
								}}
								options={insecticideOptions}
								placeholder="Search insecticides"
							/>
						)}
					</form.AppField>
					<div className="grid gap-3 @md/fields:grid-cols-2">
						<form.AppField name={lineFieldName(index, 'amount')}>
							{(field) => (
								<field.NumberField label="Amount" required min={0} placeholder="e.g. 12.5" />
							)}
						</form.AppField>
						<form.AppField name={lineFieldName(index, 'unitId')}>
							{(field) => (
								<field.SelectField
									label="Unit"
									required
									options={unitOptionsFor(line.insecticideId)}
									placeholder="Select unit"
								/>
							)}
						</form.AppField>
					</div>
				</>
			)}

			{line.insecticideId === '' ? null : (
				<form.AppField name={lineFieldName(index, 'batchIds')}>
					{(field) => (
						<InsecticideBatchOptions insecticideId={line.insecticideId}>
							{(options) => (
								<field.MultiSelectField
									emptyMessage="No batches for this product"
									label="Batches"
									options={options}
									placeholder="Search batches"
								/>
							)}
						</InsecticideBatchOptions>
					)}
				</form.AppField>
			)}
		</li>
	);
}

/**
 * A saved row the crew took out, struck through until Save, with the batch
 * links that go with it and a way to keep it.
 */
export function RemovedTreatmentLineRow({
	line,
	insecticides,
	units,
	onKeep,
}: {
	readonly line: TreatmentLineValue;
	readonly insecticides: readonly InsecticideListing[];
	readonly units: readonly UnitLabel[];
	readonly onKeep: () => void;
}) {
	const unit = units.find((row) => row.id === line.unitId);
	const amount = line.amount === null ? '' : ` ${formatAmountWithUnit(line.amount, unit)}`;
	return (
		<li className="flex items-center justify-between gap-2 border-border border-t px-3 py-2 text-sm first:border-t-0">
			<span className="text-muted-foreground">
				<s>
					{productLabel(insecticides, line.insecticideId)}
					{amount}
				</s>
				{line.savedBatchCount > 0 ? ` · ${batchLinksGoing(line.savedBatchCount)}` : ''}
			</span>
			<Button onClick={onKeep} size="xs" type="button" variant="link">
				Keep
			</Button>
		</li>
	);
}

/** `1 batch link goes with it`, `2 batch links go with it`. */
function batchLinksGoing(total: number): string {
	return total === 1 ? '1 batch link goes with it' : `${total} batch links go with it`;
}

function RowErrors({ errors }: { readonly errors: readonly unknown[] }) {
	const messages = errors.filter((error) => error !== undefined && error !== null).map(String);
	if (messages.length === 0) {
		return null;
	}
	return (
		<p className="m-0 text-destructive text-xs" role="alert">
			{messages[0]}
		</p>
	);
}
