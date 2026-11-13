/**
 * PROTOTYPE, throwaway (#1743). Variant B, "Product cards": the crew first says
 * how they mixed (product by product, or from a formulation), then each product
 * is a card that reads as a sentence and opens to edit. A removed card folds into
 * a one-line strip with Undo. Refusals land on the card and in a summary above Save.
 */
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	NativeSelect,
	NativeSelectOption,
} from '@simmer-mosquito/ui-web/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { useState } from 'react';
import { productLabel } from '../application-form-values';
import { AmountInput, BatchPicker, ProductSelect, UnitSelect } from './controls';
import { batchPhrase, formulationOf, type Line, liveCount } from './model';
import type { VariantProps } from './ops';

export function VariantBCards({ catalog, mode, lines, mix, refusals, ops }: VariantProps) {
	const [path, setPath] = useState<'products' | 'formulation'>(
		mix === null ? 'products' : 'formulation',
	);
	const [openId, setOpenId] = useState<string | null>(null);
	const live = liveCount(lines);
	const unitAbbr = (id: string) => catalog.units.find((unit) => unit.id === id)?.abbreviation ?? '';
	const errorCount = refusals.lineErrors.size + (refusals.formError === null ? 0 : 1);
	const formulation = mix === null ? undefined : formulationOf(catalog, mix.formulationId);
	const mixUnit = unitAbbr(formulation?.batchUnitId ?? '');

	return (
		<section className="grid gap-4">
			<ToggleGroup
				aria-label="How this was mixed"
				className="w-full"
				onValueChange={(next) => {
					if (next === 'products' || next === 'formulation') {
						setPath(next);
						if (next === 'products') {
							ops.setMix(null);
						}
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
							onChange={(event) => {
								const next = {
									formulationId: event.target.value,
									mixAmount: mix?.mixAmount ?? null,
								};
								if (mode === 'create') {
									ops.fillFromMix(next);
								} else {
									ops.setMix(next);
								}
							}}
							value={mix?.formulationId ?? ''}
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
					</label>
					<label className="grid gap-1 text-sm">
						<span className="font-medium">
							Total mix applied{mixUnit === '' ? '' : ` (${mixUnit})`}
						</span>
						<AmountInput
							label="Total mix applied"
							onChange={(mixAmount) => {
								if (mix === null) {
									return;
								}
								const next = { ...mix, mixAmount };
								if (mode === 'create') {
									ops.fillFromMix(next);
								} else {
									ops.setMix(next);
								}
							}}
							placeholder="e.g. 78"
							value={mix?.mixAmount ?? null}
						/>
					</label>
					{mode === 'edit' && mix !== null ? (
						<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs @md/fields:col-span-2">
							<span>Changing the mix keeps the products below as recorded.</span>
							<Button
								onClick={() => ops.fillFromMix(mix)}
								size="xs"
								type="button"
								variant="outline"
							>
								Refill products from mix
							</Button>
						</div>
					) : null}
				</div>
			) : null}

			<ul className="m-0 grid list-none gap-2 p-0">
				{lines.map((line, index) =>
					line.removed ? (
						<li
							className="flex items-center justify-between gap-2 rounded-md border border-border border-dashed px-3 py-2 text-muted-foreground text-sm"
							key={line.id}
						>
							<span>
								Removing {productLabel(catalog.insecticides, line.insecticideId)}
								{line.batchIds.length > 0 ? ` and its ${batchPhrase(line.batchIds.length)}` : ''}{' '}
								when you save.
							</span>
							<Button
								onClick={() => ops.undoRemove(line.id)}
								size="xs"
								type="button"
								variant="ghost"
							>
								Undo
							</Button>
						</li>
					) : (
						<ProductCard
							catalog={catalog}
							error={refusals.lineErrors.get(line.id)}
							index={index}
							key={line.id}
							line={line}
							onToggle={() => setOpenId((current) => (current === line.id ? null : line.id))}
							open={openId === line.id || line.insecticideId === ''}
							ops={ops}
							unitAbbr={unitAbbr}
						/>
					),
				)}
			</ul>

			<Button
				className="justify-self-start"
				onClick={() => {
					ops.add();
					setOpenId(null);
				}}
				size="sm"
				type="button"
				variant="outline"
			>
				Add another product
			</Button>

			<div className="flex items-baseline justify-between gap-2 border-border border-t pt-3 text-sm">
				<span className="font-medium">
					{live} {live === 1 ? 'product' : 'products'} on this treatment
				</span>
				{errorCount > 0 ? (
					<span className="text-destructive text-xs" role="alert">
						{refusals.formError ??
							`${errorCount} ${errorCount === 1 ? 'product needs' : 'products need'} attention`}
					</span>
				) : null}
			</div>
		</section>
	);
}

function ProductCard({
	catalog,
	line,
	index,
	open,
	onToggle,
	ops,
	error,
	unitAbbr,
}: Pick<VariantProps, 'catalog' | 'ops'> & {
	readonly line: Line;
	readonly index: number;
	readonly open: boolean;
	readonly onToggle: () => void;
	readonly error: string | undefined;
	readonly unitAbbr: (id: string) => string;
}) {
	return (
		<li
			className={`grid gap-3 rounded-lg border p-3 ${error === undefined ? 'border-border' : 'border-destructive'}`}
		>
			<div className="flex items-start justify-between gap-2">
				<button className="grid min-w-0 gap-0.5 text-left" onClick={onToggle} type="button">
					<span className="truncate font-medium text-sm">
						{line.insecticideId === ''
							? `Product ${index + 1}`
							: productLabel(catalog.insecticides, line.insecticideId)}
					</span>
					<span className="text-muted-foreground text-xs">
						{line.amount === null ? 'No amount yet' : `${line.amount} ${unitAbbr(line.unitId)}`}
						{' · '}
						{line.batchIds.length === 0 ? 'no batches' : batchPhrase(line.batchIds.length)}
					</span>
				</button>
				<div className="flex shrink-0 items-center gap-1">
					{line.fromMix !== null ? (
						<Badge variant={line.amount === line.fromMix ? 'secondary' : 'outline'}>
							{line.amount === line.fromMix ? 'From mix' : 'Edited from mix'}
						</Badge>
					) : null}
					<Button onClick={onToggle} size="xs" type="button" variant="ghost">
						{open ? 'Done' : 'Edit'}
					</Button>
					<Button onClick={() => ops.remove(line.id)} size="xs" type="button" variant="ghost">
						Remove
					</Button>
				</div>
			</div>
			{open ? (
				<div className="grid gap-3">
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
					<div className="grid grid-cols-2 gap-3">
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
					</div>
					<BatchPicker
						insecticideId={line.insecticideId}
						onChange={(batchIds) => ops.update(line.id, { batchIds })}
						value={line.batchIds}
					/>
				</div>
			) : null}
			{error === undefined ? null : <p className="m-0 text-destructive text-xs">{error}</p>}
		</li>
	);
}
