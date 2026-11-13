/**
 * PROTOTYPE, throwaway (#1743). Variant A, "Line table": a dense grid, one row
 * per product, with a toolbar that fills the grid from a Formulation. The mix
 * is a tool above the grid, and once applied it shows as a slim provenance strip.
 */
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	NativeSelect,
	NativeSelectOption,
} from '@simmer-mosquito/ui-web/components/ui/native-select';
import { useState } from 'react';
import { recordCount } from '../../../../lib/record-nouns';
import { productLabel } from '../application-form-values';
import { AmountInput, BatchPicker, ProductSelect, UnitSelect } from './controls';
import { batchPhrase, formulationOf, liveCount, type Mix } from './model';
import type { VariantProps } from './ops';

export function VariantATable({ catalog, mode, lines, mix, refusals, ops }: VariantProps) {
	const [draftMix, setDraftMix] = useState<Mix>({ formulationId: '', mixAmount: null });
	const [mixOpen, setMixOpen] = useState(false);
	const mixUnit = catalog.units.find(
		(unit) => unit.id === formulationOf(catalog, draftMix.formulationId)?.batchUnitId,
	);
	const live = liveCount(lines);

	return (
		<section className="grid gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="m-0 font-semibold text-sm">Products</h3>
				<div className="flex gap-2">
					<Button
						onClick={() => setMixOpen((open) => !open)}
						size="sm"
						type="button"
						variant="outline"
					>
						{mix === null ? 'Fill from formulation' : 'Change formulation'}
					</Button>
					<Button onClick={ops.add} size="sm" type="button" variant="outline">
						Add product
					</Button>
				</div>
			</div>

			{mixOpen ? (
				<div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
					<div className="grid gap-2 @md/fields:grid-cols-[1fr_8rem_auto]">
						<NativeSelect
							aria-label="Formulation"
							onChange={(event) => setDraftMix({ ...draftMix, formulationId: event.target.value })}
							value={draftMix.formulationId}
						>
							<NativeSelectOption value="">Pick a formulation</NativeSelectOption>
							{catalog.formulations
								.filter((row) => row.isActive)
								.map((row) => (
									<NativeSelectOption key={row.id} value={row.id}>
										{row.formulationName}
									</NativeSelectOption>
								))}
						</NativeSelect>
						<AmountInput
							label="Total mix applied"
							onChange={(mixAmount) => setDraftMix({ ...draftMix, mixAmount })}
							placeholder={mixUnit === undefined ? 'Mix total' : `Mix (${mixUnit.abbreviation})`}
							value={draftMix.mixAmount}
						/>
						<Button
							disabled={draftMix.formulationId === ''}
							onClick={() => {
								if (mode === 'create') {
									ops.fillFromMix(draftMix);
								} else {
									ops.setMix(draftMix);
								}
								setMixOpen(false);
							}}
							size="sm"
							type="button"
						>
							{mode === 'create' ? 'Fill lines' : 'Set formulation'}
						</Button>
					</div>
					<p className="m-0 text-muted-foreground text-xs">
						{mode === 'create'
							? 'Replaces the lines below with one per product in the mix.'
							: 'Records which mix this was. The lines below stay as they are.'}
					</p>
				</div>
			) : null}

			{mix !== null ? (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-xs">
					<span>
						Mixed from <strong>{formulationOf(catalog, mix.formulationId)?.formulationName}</strong>
						{mix.mixAmount === null ? null : ` · ${mix.mixAmount} of finished mix`}
					</span>
					<Button onClick={() => ops.setMix(null)} size="xs" type="button" variant="ghost">
						Clear
					</Button>
				</div>
			) : null}

			<div className="overflow-x-auto rounded-md border border-border">
				<table className="w-full border-collapse text-sm">
					<thead className="bg-muted/40 text-left text-muted-foreground text-xs">
						<tr>
							<th className="px-2 py-1.5 font-medium">Product</th>
							<th className="w-24 px-2 py-1.5 font-medium">Amount</th>
							<th className="w-32 px-2 py-1.5 font-medium">Unit</th>
							<th className="px-2 py-1.5 font-medium">Batches</th>
							<th className="w-8" />
						</tr>
					</thead>
					<tbody>
						{lines.map((line) =>
							line.removed ? (
								<tr className="border-border border-t bg-destructive/5" key={line.id}>
									<td className="px-2 py-1.5 text-muted-foreground line-through" colSpan={3}>
										{productLabel(catalog.insecticides, line.insecticideId)} · {line.amount}
									</td>
									<td className="px-2 py-1.5 text-muted-foreground text-xs">
										Removed on save
										{line.batchIds.length > 0
											? `, with its ${batchPhrase(line.batchIds.length)}`
											: ''}
									</td>
									<td className="px-1">
										<Button
											onClick={() => ops.undoRemove(line.id)}
											size="xs"
											type="button"
											variant="ghost"
										>
											Undo
										</Button>
									</td>
								</tr>
							) : (
								<RowEditor
									key={line.id}
									{...{ catalog, line, ops, live }}
									error={refusals.lineErrors.get(line.id)}
								/>
							),
						)}
						{lines.length === 0 ? (
							<tr>
								<td className="px-2 py-4 text-center text-muted-foreground text-sm" colSpan={5}>
									No products yet.
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
			</div>

			{refusals.formError === null ? null : (
				<p className="m-0 text-destructive text-sm" role="alert">
					{refusals.formError}
				</p>
			)}
			<p className="m-0 text-muted-foreground text-xs">
				Saves as 1 treatment with {recordCount('application', live)}.
			</p>
		</section>
	);
}

function RowEditor({
	catalog,
	line,
	ops,
	live,
	error,
}: Pick<VariantProps, 'catalog' | 'ops'> & {
	readonly line: VariantProps['lines'][number];
	readonly live: number;
	readonly error: string | undefined;
}) {
	return (
		<>
			<tr className="border-border border-t align-top">
				<td className="px-2 py-1.5">
					<ProductSelect
						catalog={catalog}
						invalid={error !== undefined}
						onChange={(insecticideId) => {
							const product = catalog.insecticides.find((row) => row.id === insecticideId);
							ops.update(line.id, {
								insecticideId,
								unitId: product?.defaultUnitId ?? '',
								batchIds: [],
							});
						}}
						value={line.insecticideId}
					/>
				</td>
				<td className="px-2 py-1.5">
					<AmountInput onChange={(amount) => ops.update(line.id, { amount })} value={line.amount} />
				</td>
				<td className="px-2 py-1.5">
					<UnitSelect
						catalog={catalog}
						insecticideId={line.insecticideId}
						onChange={(unitId) => ops.update(line.id, { unitId })}
						value={line.unitId}
					/>
				</td>
				<td className="px-2 py-1.5">
					<BatchPicker
						insecticideId={line.insecticideId}
						onChange={(batchIds) => ops.update(line.id, { batchIds })}
						value={line.batchIds}
					/>
				</td>
				<td className="px-1 py-1.5">
					<Button
						aria-label="Remove line"
						disabled={live === 1}
						onClick={() => ops.remove(line.id)}
						size="icon-xs"
						title={live === 1 ? 'A treatment keeps at least one product.' : 'Remove line'}
						type="button"
						variant="ghost"
					>
						×
					</Button>
				</td>
			</tr>
			{error === undefined ? null : (
				<tr>
					<td className="px-2 pb-2 text-destructive text-xs" colSpan={5}>
						{error}
					</td>
				</tr>
			)}
		</>
	);
}
