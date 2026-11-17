import type { FieldOption } from '@simmer-mosquito/ui-web/components/form';
import { FormSection } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type {
	FormulationListing,
	InsecticideListing,
} from '../../../hooks/queries/chemical-roster-view';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { formatAmountWithUnit } from './formulation-math';
import type { TreatmentForm, TreatmentFormValues } from './treatment-form-values';
import { RemovedTreatmentLineRow, TreatmentLineRow } from './treatment-line-row';
import {
	blankLine,
	keepLine,
	linesFromRecipe,
	liveLines,
	recomputeLines,
	removeLine,
	type TreatmentRecipe,
} from './treatment-line-values';

const AddIcon = iconRegistry.actions.add.icon;

/**
 * The Treatment's products: the "Product by product / From a formulation"
 * toggle, the Formulation and mix total under the second, and the numbered
 * product list with its footer. Takes the form, the catalogs the rows pick
 * from, and `recipeFor`, which reads a Formulation and its components by id.
 */
export function TreatmentProductsSection({
	form,
	insecticides,
	insecticideOptions,
	units,
	unitOptionsFor,
	formulationOptions,
	recipeFor,
}: {
	readonly form: TreatmentForm;
	readonly insecticides: readonly InsecticideListing[];
	readonly insecticideOptions: readonly FieldOption[];
	readonly units: readonly UnitLabel[];
	readonly unitOptionsFor: (insecticideId: string) => readonly FieldOption[];
	readonly formulationOptions: readonly FieldOption[];
	readonly recipeFor: (formulationId: string) => TreatmentRecipe;
}) {
	const setLines = (next: TreatmentFormValues['lines']) => form.setFieldValue('lines', next);

	return (
		<FormSection title="Products">
			<form.AppField name="entry">
				{(field) => (
					<ToggleGroup
						aria-label="Product entry"
						className="w-full"
						onValueChange={(next) => {
							if (next !== 'products' && next !== 'formulation') {
								return;
							}
							field.handleChange(next);
							// Product by product names no Formulation, so the set clears whole
							// and the rows stay as editable lines.
							if (next === 'products') {
								form.setFieldValue('formulationId', '');
								form.setFieldValue('mixAmount', null);
							}
						}}
						size="sm"
						type="single"
						value={field.state.value}
						variant="outline"
					>
						<ToggleGroupItem className="flex-1 text-xs" value="products">
							Product by product
						</ToggleGroupItem>
						<ToggleGroupItem className="flex-1 text-xs" value="formulation">
							From a formulation
						</ToggleGroupItem>
					</ToggleGroup>
				)}
			</form.AppField>

			<form.Subscribe selector={(state) => state.values.entry}>
				{(entry) =>
					entry === 'formulation' ? (
						<div className="grid gap-5 @md/fields:grid-cols-2">
							<form.AppField name="formulationId">
								{(field) => (
									<field.AutocompleteField
										emptyValue=""
										label="Formulation"
										required
										onValueChange={(next, previousValue) => {
											if (next === previousValue) {
												return;
											}
											const { lines, mixAmount } = form.state.values;
											setLines(linesFromRecipe(lines, recipeFor(next ?? ''), mixAmount));
										}}
										options={formulationOptions}
										placeholder="Search formulations"
									/>
								)}
							</form.AppField>
							<form.Subscribe selector={(state) => state.values.formulationId}>
								{(formulationId) => {
									const unit = units.find(
										(row) => row.id === recipeFor(formulationId).formulation?.batchUnitId,
									);
									return (
										<form.AppField
											listeners={{
												onChange: ({ value }) => {
													const { lines, formulationId: chosen } = form.state.values;
													if (chosen !== '') {
														setLines(recomputeLines(lines, recipeFor(chosen), value));
													}
												},
											}}
											name="mixAmount"
										>
											{(field) => (
												<field.NumberField
													description={
														unit === undefined
															? 'Finished mix, not product.'
															: `In ${unit.unitName}.`
													}
													label="Total mix applied"
													required
													min={0}
													placeholder="e.g. 78"
												/>
											)}
										</form.AppField>
									);
								}}
							</form.Subscribe>
						</div>
					) : null
				}
			</form.Subscribe>

			<form.Subscribe
				selector={(state) =>
					[
						state.values.lines,
						state.values.entry,
						state.values.formulationId,
						state.values.mixAmount,
					] as const
				}
			>
				{([lines, entry, formulationId, mixAmount]) => {
					const fromFormulation = entry === 'formulation';
					if (fromFormulation && formulationId === '') {
						return (
							<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-2 text-muted-foreground text-sm">
								Pick a formulation to fill the products.
							</p>
						);
					}
					const live = liveLines(lines);
					const formulation = recipeFor(formulationId).formulation;
					let number = 0;
					return (
						<section className="grid overflow-hidden rounded-lg border border-border">
							<ol className="m-0 grid list-none p-0">
								{lines.map((line, index) => {
									if (line.removed) {
										return (
											<RemovedTreatmentLineRow
												insecticides={insecticides}
												key={line.id}
												line={line}
												onKeep={() => setLines(keepLine(form.state.values.lines, line.id))}
												units={units}
											/>
										);
									}
									number += 1;
									return (
										<TreatmentLineRow
											canRemove={live.length > 1}
											form={form}
											index={index}
											insecticideOptions={insecticideOptions}
											insecticides={insecticides}
											key={line.id}
											line={line}
											locked={fromFormulation}
											number={number}
											onRemove={() => setLines(removeLine(form.state.values.lines, line.id))}
											unitOptionsFor={unitOptionsFor}
											units={units}
										/>
									);
								})}
							</ol>
							<div className="flex flex-wrap items-center justify-between gap-2 border-border border-t bg-muted/20 px-3 py-2">
								{fromFormulation ? (
									<span className="text-muted-foreground text-xs">
										To add or drop a product, switch to product by product.
									</span>
								) : (
									<Button
										onClick={() => setLines([...form.state.values.lines, blankLine()])}
										size="sm"
										type="button"
										variant="ghost"
									>
										<AddIcon aria-hidden="true" />
										Product
									</Button>
								)}
								<span className="text-muted-foreground text-xs">
									{productCount(live.length)}
									{fromFormulation ? mixSource(formulation, mixAmount, units) : ''}
								</span>
							</div>
						</section>
					);
				}}
			</form.Subscribe>
		</FormSection>
	);
}

/** ` from 78 gal of Mix A`, or nothing until the mix has a total. */
function mixSource(
	formulation: FormulationListing | undefined,
	mixAmount: number | null,
	units: readonly UnitLabel[],
): string {
	if (formulation === undefined || mixAmount === null) {
		return '';
	}
	const unit = units.find((row) => row.id === formulation.batchUnitId);
	return ` from ${formatAmountWithUnit(mixAmount, unit)} of ${formulation.formulationName}`;
}

/** `1 product`, `3 products`. */
function productCount(total: number): string {
	return `${total} ${total === 1 ? 'product' : 'products'}`;
}
