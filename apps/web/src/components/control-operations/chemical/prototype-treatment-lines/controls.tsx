/**
 * PROTOTYPE, throwaway (#1743). Small inputs the variants share. Layout is
 * each variant's own; only these leaf controls are common.
 */
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	NativeSelect,
	NativeSelectOption,
} from '@simmer-mosquito/ui-web/components/ui/native-select';
import { unitOptions } from '../../../../lib/unit-options';
import { insecticideDisplayName } from '../../control-display';
import { isApplicationUnitType } from '../application-form-values';
import { InsecticideBatchOptions } from '../insecticide-batch-options';
import { type Catalog, SEED_BATCHES } from './model';

export function ProductSelect({
	catalog,
	value,
	onChange,
	invalid,
}: {
	readonly catalog: Catalog;
	readonly value: string;
	readonly onChange: (insecticideId: string) => void;
	readonly invalid?: boolean;
}) {
	return (
		<NativeSelect
			aria-invalid={invalid}
			aria-label="Insecticide"
			className="w-full"
			onChange={(event) => onChange(event.target.value)}
			value={value}
		>
			<NativeSelectOption value="">Pick a product</NativeSelectOption>
			{catalog.insecticides
				.filter((row) => row.isActive || row.id === value)
				.map((row) => (
					<NativeSelectOption key={row.id} value={row.id}>
						{insecticideDisplayName(row)}
					</NativeSelectOption>
				))}
		</NativeSelect>
	);
}

export function UnitSelect({
	catalog,
	insecticideId,
	value,
	onChange,
}: {
	readonly catalog: Catalog;
	readonly insecticideId: string;
	readonly value: string;
	readonly onChange: (unitId: string) => void;
}) {
	const product = catalog.insecticides.find((row) => row.id === insecticideId);
	const productType = catalog.units.find((unit) => unit.id === product?.defaultUnitId)?.unitType;
	const options = unitOptions(catalog.units, (type) =>
		productType === undefined ? isApplicationUnitType(type) : type === productType,
	);
	return (
		<NativeSelect
			aria-label="Unit"
			className="w-full"
			onChange={(event) => onChange(event.target.value)}
			value={value}
		>
			<NativeSelectOption value="">Unit</NativeSelectOption>
			{options.map((option) => (
				<NativeSelectOption key={option.value} value={option.value}>
					{option.label}
				</NativeSelectOption>
			))}
		</NativeSelect>
	);
}

export function AmountInput({
	value,
	onChange,
	placeholder = 'Amount',
	label = 'Amount applied',
}: {
	readonly value: number | null;
	readonly onChange: (amount: number | null) => void;
	readonly placeholder?: string;
	readonly label?: string;
}) {
	return (
		<Input
			aria-label={label}
			inputMode="decimal"
			min={0}
			onChange={(event) =>
				onChange(event.target.value === '' ? null : Number.parseFloat(event.target.value))
			}
			placeholder={placeholder}
			type="number"
			value={value ?? ''}
		/>
	);
}

/** Chips for the chosen lots plus an "Add batch" select of the rest. */
export function BatchPicker({
	insecticideId,
	value,
	onChange,
}: {
	readonly insecticideId: string;
	readonly value: readonly string[];
	readonly onChange: (batchIds: readonly string[]) => void;
}) {
	if (insecticideId === '') {
		return <span className="text-muted-foreground text-xs">Pick a product to add batches.</span>;
	}
	return (
		<InsecticideBatchOptions insecticideId={insecticideId}>
			{(liveOptions) => {
				const options = [...SEED_BATCHES, ...liveOptions];
				const labelOf = (id: string) => options.find((option) => option.value === id)?.label ?? id;
				const rest = options.filter(
					(option) => !value.includes(option.value) && !option.value.startsWith('seed-'),
				);
				return (
					<div className="flex flex-wrap items-center gap-1.5">
						{value.map((id) => (
							<span
								className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
								key={id}
							>
								{labelOf(id)}
								<button
									aria-label={`Remove ${labelOf(id)}`}
									className="text-muted-foreground hover:text-foreground"
									onClick={() => onChange(value.filter((other) => other !== id))}
									type="button"
								>
									×
								</button>
							</span>
						))}
						<NativeSelect
							aria-label="Add batch"
							className="h-7 text-xs"
							onChange={(event) => {
								if (event.target.value !== '') {
									onChange([...value, event.target.value]);
								}
							}}
							value=""
						>
							<NativeSelectOption value="">
								{rest.length === 0 ? 'No more batches' : '+ Batch'}
							</NativeSelectOption>
							{rest.map((option) => (
								<NativeSelectOption key={option.value} value={option.value}>
									{option.label}
								</NativeSelectOption>
							))}
						</NativeSelect>
					</div>
				);
			}}
		</InsecticideBatchOptions>
	);
}
