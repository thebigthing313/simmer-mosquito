'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useEffect, useRef, useState } from 'react';
import { useFieldContext } from '../form-contexts';
import {
	customFieldDescriptors,
	hasCustomFieldValue,
	isPlainJsonObject,
	type MetadataValue,
	type MetadataValueType,
} from './custom-schema';
import { FormFieldFrame } from './field-frame';
import type { JsonSchemaValue } from './json-schema-field';
import type { BaseFieldProps } from './text-field';

/**
 * Editor for a record's `metadata` JSON column.
 *
 * Two modes. `manual` is a free-form key/value editor. `schema` renders the
 * typed fields an agency declared on the record's method or type (a lookup
 * row's `customSchema`) — collection methods, habitat types, source reduction
 * methods, and so on. Schema fields keep their declared key verbatim; any value
 * whose key the schema does not declare still renders (as an ad-hoc row) so a
 * method change surfaces its orphans instead of silently keeping or dropping
 * them.
 */

export type MetadataMode =
	| { readonly kind: 'manual' }
	| {
			readonly kind: 'schema';
			/** The selected method's / type's `customSchema`. */
			readonly schema: JsonSchemaValue;
			/** Allow ad-hoc keys alongside the declared fields. */
			readonly allowExtra?: boolean | undefined;
	  };

interface MetadataRow {
	readonly id: string;
	/** The key this row is stored under. Ad-hoc rows re-derive it from the label. */
	readonly key: string;
	readonly label: string;
	readonly required: boolean;
	readonly value: string;
	readonly valueType: MetadataValueType;
	/** `schema` rows are declared by the custom schema; `extra` rows are ad hoc. */
	readonly source: 'schema' | 'extra';
}

export interface MetadataFieldProps extends BaseFieldProps {
	readonly className?: string | undefined;
	readonly mode?: MetadataMode | undefined;
}

const AddIcon = iconRegistry.actions.add.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

export function MetadataField({
	label,
	required,
	description,
	disabled,
	className,
	mode = { kind: 'manual' },
}: MetadataFieldProps) {
	const field = useFieldContext<MetadataValue>();
	const [rows, setRows] = useState<readonly MetadataRow[]>(() =>
		metadataRowsFromValue(field.state.value, mode),
	);

	// Rows are re-derived when the value changes underneath us (form reset) or the
	// schema changes (the user picked a different method). Own edits commit both
	// at once, so they never round-trip through this effect.
	const modeKey = mode.kind === 'schema' ? `schema:${jsonKey(mode.schema)}` : 'manual';
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const committedKey = useRef(`${modeKey}:${jsonKey(field.state.value)}`);

	useEffect(() => {
		const nextKey = `${modeKey}:${jsonKey(field.state.value)}`;
		if (nextKey !== committedKey.current) {
			committedKey.current = nextKey;
			setRows(metadataRowsFromValue(field.state.value, modeRef.current));
		}
	}, [field.state.value, modeKey]);

	function commitRows(nextRows: readonly MetadataRow[]) {
		const nextValue = metadataValueFromRows(nextRows);
		committedKey.current = `${modeKey}:${jsonKey(nextValue)}`;
		setRows(nextRows);
		field.handleChange(nextValue);
	}

	function updateRow(id: string, changes: Partial<MetadataRow>) {
		commitRows(rows.map((current) => (current.id === id ? { ...current, ...changes } : current)));
	}

	const canAddRow = mode.kind === 'manual' || mode.allowExtra === true;
	const emptyLabel = mode.kind === 'schema' ? 'No custom fields.' : 'No metadata fields.';

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			required={required}
			renderControl={(controlProps) => (
				<div
					{...controlProps}
					className={['grid gap-2 rounded-md border border-border/30 bg-muted/20 p-2.5', className]
						.filter(Boolean)
						.join(' ')}
				>
					{rows.length === 0 ? (
						<p className="m-0 rounded-md bg-background/70 px-2.5 py-2 text-[0.84rem] text-muted-foreground">
							{emptyLabel}
						</p>
					) : (
						rows.map((row) => (
							<section
								className="grid gap-2 rounded-md border border-border/30 bg-background p-2.5"
								key={row.id}
							>
								{row.source === 'schema' ? (
									<SchemaMetadataControl
										disabled={disabled}
										onBlur={field.handleBlur}
										onChange={(value) => updateRow(row.id, { value })}
										row={row}
									/>
								) : (
									<div className="grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_auto]">
										<div className="grid min-w-0 gap-1">
											<span className="text-[0.74rem] font-bold text-muted-foreground">
												Field name
											</span>
											<Input
												aria-label="Metadata field name"
												disabled={disabled}
												onBlur={field.handleBlur}
												onChange={(event) =>
													updateRow(row.id, {
														label: event.target.value,
														key: fieldKeyFromLabel(event.target.value),
													})
												}
												placeholder="e.g. License plate"
												value={row.label}
											/>
										</div>
										<div className="grid min-w-0 gap-1">
											<span className="text-[0.74rem] font-bold text-muted-foreground">Value</span>
											<Input
												aria-label={`${row.label.trim().length === 0 ? 'Metadata' : row.label} value`}
												disabled={disabled}
												onBlur={field.handleBlur}
												onChange={(event) => updateRow(row.id, { value: event.target.value })}
												placeholder="e.g. ABC123"
												value={row.value}
											/>
										</div>
										<Button
											aria-label={`Remove ${row.label.trim().length === 0 ? 'metadata field' : row.label}`}
											className="self-end"
											disabled={disabled}
											onClick={() => commitRows(rows.filter((current) => current.id !== row.id))}
											size="icon"
											type="button"
											variant="destructive"
										>
											<DeleteIcon aria-hidden="true" />
										</Button>
									</div>
								)}
							</section>
						))
					)}
					{canAddRow ? (
						<Button
							className="w-fit"
							disabled={disabled}
							onClick={() =>
								commitRows([
									...rows,
									{
										id: crypto.randomUUID(),
										key: '',
										label: '',
										required: false,
										source: 'extra',
										value: '',
										valueType: 'text',
									},
								])
							}
							size="sm"
							type="button"
							variant="outline"
						>
							<AddIcon aria-hidden="true" />
							Add Field
						</Button>
					) : null}
				</div>
			)}
		/>
	);
}

function SchemaMetadataControl({
	disabled,
	onBlur,
	onChange,
	row,
}: {
	readonly disabled?: boolean | undefined;
	readonly onBlur: () => void;
	readonly onChange: (value: string) => void;
	readonly row: MetadataRow;
}) {
	if (row.valueType === 'boolean') {
		return (
			<div className="flex min-h-9 items-center justify-between gap-3 rounded-md border border-border/30 bg-muted/30 px-2.5 text-[0.84rem] font-bold">
				<span>
					{row.label}
					{row.required ? <span className="text-destructive"> *</span> : null}
				</span>
				<Switch
					aria-label={row.label}
					checked={row.value === 'true'}
					disabled={disabled}
					onBlur={onBlur}
					onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
				/>
			</div>
		);
	}

	return (
		<div className="grid gap-1">
			<span className="text-[0.74rem] font-bold text-muted-foreground">
				{row.label}
				{row.required ? <span className="text-destructive"> *</span> : null}
			</span>
			{row.valueType === 'text' ? (
				<Input
					aria-label={row.label}
					disabled={disabled}
					onBlur={onBlur}
					onChange={(event) => onChange(event.target.value)}
					placeholder={`e.g. ${row.label}`}
					value={row.value}
				/>
			) : row.valueType === 'date' ? (
				<Input
					aria-label={row.label}
					disabled={disabled}
					onBlur={onBlur}
					onChange={(event) => onChange(event.target.value)}
					type="date"
					value={row.value}
				/>
			) : (
				<Input
					aria-label={row.label}
					disabled={disabled}
					onBlur={onBlur}
					onChange={(event) => onChange(event.target.value)}
					step={row.valueType === 'integer' ? 1 : 'any'}
					type="number"
					value={row.value}
				/>
			)}
		</div>
	);
}

export function validateMetadataValue({
	value,
}: {
	readonly value: MetadataValue;
}): string | undefined {
	return value === null || isPlainJsonObject(value)
		? undefined
		: 'Metadata must be a JSON object or blank.';
}

/**
 * Validator for metadata guided by a custom schema: the value must be an object,
 * and every field the schema marks required must be filled in. Yes/no fields are
 * exempt — an untouched switch reads as "no", so requiring one is unanswerable.
 */
export function validateSchemaMetadata(schema: unknown) {
	const descriptors = customFieldDescriptors(schema);
	return ({ value }: { readonly value: MetadataValue }): string | undefined => {
		const invalid = validateMetadataValue({ value });
		if (invalid !== undefined) {
			return invalid;
		}
		const object = isPlainJsonObject(value) ? value : {};
		const missing = descriptors.find(
			(descriptor) =>
				descriptor.required &&
				descriptor.valueType !== 'boolean' &&
				!hasCustomFieldValue(object[descriptor.key]),
		);
		return missing === undefined ? undefined : `${missing.label} is required.`;
	};
}

function metadataRowsFromValue(value: MetadataValue, mode: MetadataMode): readonly MetadataRow[] {
	const objectValue = isPlainJsonObject(value) ? value : {};
	const descriptors = mode.kind === 'schema' ? customFieldDescriptors(mode.schema) : [];
	const declaredKeys = new Set(descriptors.map((descriptor) => descriptor.key));

	return [
		...descriptors.map((descriptor) => ({
			id: crypto.randomUUID(),
			key: descriptor.key,
			label: descriptor.label,
			required: descriptor.required,
			source: 'schema' as const,
			value: displayValue(objectValue[descriptor.key]),
			valueType: descriptor.valueType,
		})),
		...Object.entries(objectValue)
			.filter(([key]) => !declaredKeys.has(key))
			.map(([key, rawValue]) => ({
				id: crypto.randomUUID(),
				key,
				label: key,
				required: false,
				source: 'extra' as const,
				value: displayValue(rawValue),
				valueType: 'text' as const,
			})),
	];
}

function metadataValueFromRows(rows: readonly MetadataRow[]): MetadataValue {
	const entries: Array<readonly [string, unknown]> = [];
	const usedKeys = new Set<string>();
	// Declared fields claim their keys first so an ad-hoc row can never shadow one.
	const ordered = [
		...rows.filter((row) => row.source === 'schema'),
		...rows.filter((row) => row.source === 'extra'),
	];

	for (const row of ordered) {
		if (row.key.length === 0 || row.value.trim().length === 0) {
			continue;
		}
		entries.push([uniqueFieldKey(row.key, usedKeys), valueFromRow(row)]);
	}

	return entries.length === 0 ? null : Object.fromEntries(entries);
}

function displayValue(value: unknown): string {
	return value === null || value === undefined ? '' : String(value);
}

function valueFromRow(row: MetadataRow): unknown {
	if (row.valueType === 'boolean') {
		return row.value === 'true';
	}
	if (row.valueType === 'integer') {
		const value = Number(row.value);
		return Number.isFinite(value) ? Math.trunc(value) : row.value;
	}
	if (row.valueType === 'number') {
		const value = Number(row.value);
		return Number.isFinite(value) ? value : row.value;
	}
	return row.value;
}

function fieldKeyFromLabel(label: string): string {
	const parts = label
		.trim()
		.split(/[^a-zA-Z0-9]+/g)
		.filter((part) => part.length > 0);
	return parts.join(' ').trim();
}

function uniqueFieldKey(baseKey: string, usedKeys: Set<string>): string {
	let key = baseKey;
	let suffix = 2;
	while (usedKeys.has(key)) {
		key = `${baseKey} ${suffix}`;
		suffix += 1;
	}
	usedKeys.add(key);
	return key;
}

function jsonKey(value: unknown): string {
	return value === null || value === undefined ? 'null' : JSON.stringify(value);
}
