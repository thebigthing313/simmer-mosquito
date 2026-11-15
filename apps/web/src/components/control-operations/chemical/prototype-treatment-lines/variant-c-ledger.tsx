/**
 * PROTOTYPE, throwaway (#1743). Variant C, "Mix ledger": the Formulation is a
 * calculator pinned above a ledger of what went out. Each product row shows what
 * the mix works out to beside what the crew records, so an edit away from the
 * recipe reads as a difference. Lines the crew has not touched follow the mix
 * total as it changes; edited lines stop following.
 */
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	NativeSelect,
	NativeSelectOption,
} from '@simmer-mosquito/ui-web/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { useState } from 'react';
import { productLabel } from '../application-form-values';
import { AmountInput, BatchPicker, ProductSelect, UnitSelect } from './controls';
import { batchPhrase, formulationOf, linesFromMix, liveCount, type Mix, mixShare } from './model';
import type { VariantProps } from './ops';

/** Variant D, the hybrid: B's "how was this mixed" toggle over C's ledger. */
export function VariantDHybrid(props: VariantProps) {
	return <VariantCLedger {...props} entryToggle />;
}

export function VariantCLedger({
	catalog,
	mode,
	lines,
	mix,
	refusals,
	ops,
	entryToggle = false,
}: VariantProps & { readonly entryToggle?: boolean }) {
	const [path, setPath] = useState<'products' | 'formulation'>(
		mix === null ? 'products' : 'formulation',
	);
	const unitAbbr = (id: string) => catalog.units.find((unit) => unit.id === id)?.abbreviation ?? '';
	const formulation = mix === null ? undefined : formulationOf(catalog, mix.formulationId);
	const live = liveCount(lines);
	// From a formulation, the products are the mix's: amounts, units and batches
	// stay editable, but no product is swapped, removed or added.
	const locked = entryToggle && path === 'formulation';

	// Untouched lines track the mix; a line whose amount the crew changed keeps it.
	const changeMix = (next: Mix | null) => {
		if (next === null || next.formulationId === '') {
			ops.setMix(null);
			return;
		}
		if (
			(mode === 'create' || entryToggle) &&
			(mix === null || mix.formulationId !== next.formulationId)
		) {
			ops.fillFromMix(next);
			return;
		}
		ops.setMix(next);
		if (mode === 'create') {
			const shares = linesFromMix(catalog, next);
			for (const line of lines) {
				const share =
					shares.find((row) => row.insecticideId === line.insecticideId)?.fromMix ?? null;
				const following = line.fromMix !== null && line.amount === line.fromMix;
				ops.update(line.id, following ? { amount: share, fromMix: share } : { fromMix: share });
			}
		}
	};

	const mixUnit = unitAbbr(formulation?.batchUnitId ?? '');
	const header = entryToggle ? (
		<div className="grid gap-3 bg-muted/40 p-3">
			<ToggleGroup
				aria-label="How this was mixed"
				className="w-full"
				onValueChange={(next) => {
					if (next !== 'products' && next !== 'formulation') return;
					setPath(next);
					if (next === 'products') {
						ops.setMix(null);
						for (const line of lines) ops.update(line.id, { fromMix: null });
					}
				}}
				size="sm"
				type="single"
				value={path}
				variant="outline"
			>
				<ToggleGroupItem className="flex-1 text-xs" value="products">
					Product by product
				</ToggleGroupItem>
				<ToggleGroupItem className="flex-1 text-xs" value="formulation">
					From a formulation
				</ToggleGroupItem>
			</ToggleGroup>
			{path === 'formulation' ? (
				<div className="grid gap-3 @md/fields:grid-cols-2">
					<label className="grid gap-1 text-sm">
						<span className="font-medium">Formulation</span>
						<NativeSelect
							onChange={(event) =>
								changeMix({ formulationId: event.target.value, mixAmount: mix?.mixAmount ?? null })
							}
							value={mix?.formulationId ?? ''}
						>
							<NativeSelectOption value="">Pick a formulation</NativeSelectOption>
							{catalog.formulations
								.filter((row) => row.isActive || row.id === mix?.formulationId)
								.map((row) => (
									<NativeSelectOption key={row.id} value={row.id}>
										{row.formulationName}
									</NativeSelectOption>
								))}
						</NativeSelect>
					</label>
					<label className="grid gap-1 text-sm">
						<span className="font-medium">
							Total mix applied{mixUnit === '' ? '' : ` (${mixUnit})`}
						</span>
						<AmountInput
							label="Total mix applied"
							onChange={(mixAmount) => {
								if (mix !== null) changeMix({ ...mix, mixAmount });
							}}
							placeholder="e.g. 78"
							value={mix?.mixAmount ?? null}
						/>
					</label>
					{mode === 'edit' && mix !== null ? (
						<p className="m-0 text-muted-foreground text-xs @md/fields:col-span-2">
							Picking a different formulation replaces the products below with its own.
						</p>
					) : null}
				</div>
			) : null}
		</div>
	) : null;

	return (
		<section className="grid gap-0 overflow-hidden rounded-lg border border-border">
			{header ?? (
				<div className="grid gap-3 bg-muted/40 p-3">
					<div className="flex items-baseline justify-between">
						<h3 className="m-0 font-semibold text-sm">Mix</h3>
						<span className="text-muted-foreground text-xs">Optional</span>
					</div>
					<div className="grid gap-2 @md/fields:grid-cols-[1fr_9rem]">
						<NativeSelect
							aria-label="Formulation"
							onChange={(event) =>
								changeMix({ formulationId: event.target.value, mixAmount: mix?.mixAmount ?? null })
							}
							value={mix?.formulationId ?? ''}
						>
							<NativeSelectOption value="">
								No formulation, enter products directly
							</NativeSelectOption>
							{catalog.formulations
								.filter((row) => row.isActive || row.id === mix?.formulationId)
								.map((row) => (
									<NativeSelectOption key={row.id} value={row.id}>
										{row.formulationName}
									</NativeSelectOption>
								))}
						</NativeSelect>
						{mix === null ? null : (
							<AmountInput
								label="Total mix applied"
								onChange={(mixAmount) => changeMix({ ...mix, mixAmount })}
								placeholder={`Mix total (${unitAbbr(formulation?.batchUnitId ?? '')})`}
								value={mix.mixAmount}
							/>
						)}
					</div>
					{mode === 'edit' && mix !== null ? (
						<p className="m-0 text-muted-foreground text-xs">
							The mix is a record of what was mixed. Products below are what went out, and they win
							when the two disagree.
						</p>
					) : null}
				</div>
			)}

			{refusals.formError === null ? null : (
				<p
					className="m-0 border-border border-t bg-destructive/10 px-3 py-2 text-destructive text-sm"
					role="alert"
				>
					{refusals.formError}
				</p>
			)}

			<ol className="m-0 grid list-none gap-0 p-0">
				{lines.map((line, index) => {
					const error = refusals.lineErrors.get(line.id);
					const share = mixShare(catalog, mix, line.insecticideId);
					const delta =
						share === null || line.amount === null
							? null
							: Number((line.amount - share).toFixed(4));
					if (line.removed) {
						return (
							<li
								className="flex items-center justify-between gap-2 border-border border-t px-3 py-2 text-sm"
								key={line.id}
							>
								<span className="text-muted-foreground">
									<s>
										{productLabel(catalog.insecticides, line.insecticideId)} {line.amount}{' '}
										{unitAbbr(line.unitId)}
									</s>
									{line.batchIds.length > 0
										? ` · ${batchPhrase(line.batchIds.length)} go with it`
										: ''}
								</span>
								<Button
									onClick={() => ops.undoRemove(line.id)}
									size="xs"
									type="button"
									variant="link"
								>
									Keep
								</Button>
							</li>
						);
					}
					return (
						<li
							className={`grid gap-2 border-t px-3 py-3 ${error === undefined ? 'border-border' : 'border-destructive bg-destructive/5'}`}
							key={line.id}
						>
							<div className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-2">
								<span className="text-muted-foreground text-xs tabular-nums">{index + 1}</span>
								{locked ? (
									<span className="truncate font-medium text-sm">
										{productLabel(catalog.insecticides, line.insecticideId)}
									</span>
								) : (
									<ProductSelect
										catalog={catalog}
										invalid={error !== undefined}
										onChange={(insecticideId) => {
											const product = catalog.insecticides.find((row) => row.id === insecticideId);
											ops.update(line.id, {
												insecticideId,
												unitId: product?.defaultUnitId ?? '',
												batchIds: [],
												fromMix: mixShare(catalog, mix, insecticideId),
											});
										}}
										value={line.insecticideId}
									/>
								)}
								{locked ? (
									<span className="text-muted-foreground text-xs">In the mix</span>
								) : (
									<Button
										onClick={() => ops.remove(line.id)}
										size="xs"
										type="button"
										variant="ghost"
									>
										Remove
									</Button>
								)}
							</div>
							<div className="grid grid-cols-[1.25rem_1fr_1fr] items-center gap-2 @md/fields:grid-cols-[1.25rem_7rem_9rem_1fr]">
								<span />
								<AmountInput
									onChange={(amount) => ops.update(line.id, { amount })}
									value={line.amount}
								/>
								<UnitSelect
									catalog={catalog}
									insecticideId={line.insecticideId}
									onChange={(unitId) => ops.update(line.id, { unitId })}
									value={line.unitId}
								/>
								<span className="col-span-3 text-xs tabular-nums @md/fields:col-span-1">
									{mix === null ? null : share === null ? (
										<span className="text-muted-foreground">Not in this mix</span>
									) : delta === 0 ? (
										<span className="text-muted-foreground">Matches the mix</span>
									) : (
										<span className="text-amber-700 dark:text-amber-400">
											Mix says {share} {unitAbbr(line.unitId)} (
											{delta !== null && delta > 0 ? '+' : ''}
											{delta})
										</span>
									)}
								</span>
							</div>
							<div className="pl-7">
								<BatchPicker
									insecticideId={line.insecticideId}
									onChange={(batchIds) => ops.update(line.id, { batchIds })}
									value={line.batchIds}
								/>
							</div>
							{error === undefined ? null : (
								<p className="m-0 pl-7 text-destructive text-xs">{error}</p>
							)}
						</li>
					);
				})}
			</ol>

			<div className="flex items-center justify-between gap-2 border-border border-t bg-muted/20 px-3 py-2">
				{locked ? (
					<span className="text-muted-foreground text-xs">
						To add or drop a product, switch to product by product.
					</span>
				) : (
					<Button onClick={ops.add} size="sm" type="button" variant="ghost">
						+ Product
					</Button>
				)}
				<span className="text-muted-foreground text-xs">
					{live} {live === 1 ? 'product' : 'products'}
					{mix?.mixAmount != null
						? ` from ${mix.mixAmount} ${unitAbbr(formulation?.batchUnitId ?? '')} of mix`
						: ''}
				</span>
			</div>
		</section>
	);
}
