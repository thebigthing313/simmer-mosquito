import type {
	FormulationComponentListing,
	FormulationListing,
	InsecticideListing,
} from '../../../hooks/queries/chemical-roster-view';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { recordCount } from '../../../lib/record-nouns';
import { productLabel } from './application-form-values';
import {
	componentAmounts,
	formatAmountValue,
	formatAmountWithUnit,
	sortedComponents,
} from './formulation-math';

/**
 * What the chosen mix will be saved as: one application per component product.
 * The split is the domain's own, so this is a preview of the rows.
 */
export function FormulationBreakdown({
	components,
	formulation,
	insecticides,
	totalAmount,
	units,
}: {
	readonly components: readonly FormulationComponentListing[];
	readonly formulation: FormulationListing | undefined;
	readonly insecticides: readonly InsecticideListing[];
	readonly totalAmount: number | null;
	readonly units: readonly UnitLabel[];
}) {
	if (formulation === undefined) {
		return null;
	}
	if (components.length === 0) {
		return (
			<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-2 text-muted-foreground text-sm">
				This mix has no products in it. Add one under Formulations before recording against it.
			</p>
		);
	}

	const ordered = sortedComponents(components);
	const amounts = componentAmounts({
		components: ordered,
		batchSize: formulation.batchSize,
		totalAmount,
	});
	const amountByInsecticide = new Map(
		(amounts ?? []).map((amount) => [amount.insecticideId, amount.amount] as const),
	);
	const unitById = new Map(units.map((unit) => [unit.id, unit] as const));
	const batchLabel = formatAmountWithUnit(
		formulation.batchSize,
		unitById.get(formulation.batchUnitId),
	);
	const batches = totalAmount === null ? null : totalAmount / formulation.batchSize;

	return (
		<div className="grid gap-2 rounded-md border border-border/50 bg-muted/30 p-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="font-medium text-foreground text-sm">
					Saves as {recordCount('application', ordered.length)}
				</span>
				<span className="text-muted-foreground text-xs">
					{batches === null || !Number.isFinite(batches)
						? `One batch makes ${batchLabel}`
						: `${formatAmountValue(batches)} × ${batchLabel}`}
				</span>
			</div>
			<ul className="m-0 grid list-none gap-1 p-0">
				{ordered.map((component) => {
					const unit = unitById.get(component.unitId);
					const applied = amountByInsecticide.get(component.insecticideId);
					return (
						<li className="flex items-baseline justify-between gap-3 text-sm" key={component.id}>
							<span className="min-w-0 truncate text-foreground">
								{productLabel(insecticides, component.insecticideId)}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatAmountWithUnit(component.amount, unit)} per batch
								{applied === undefined ? null : (
									<>
										{' · '}
										<span className="font-medium text-foreground text-sm">
											{formatAmountWithUnit(applied, unit)}
										</span>
									</>
								)}
							</span>
						</li>
					);
				})}
			</ul>
			{amounts === null ? (
				<p className="m-0 text-muted-foreground text-xs">
					Enter the total to see what each product works out to.
				</p>
			) : null}
		</div>
	);
}
