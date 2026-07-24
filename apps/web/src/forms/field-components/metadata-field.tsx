'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useEffect, useRef, useState } from 'react';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { JsonSchemaValue } from './json-schema-field';
import type { BaseFieldProps } from './text-field';

export type MetadataValue = Record<string, unknown> | null;

type MetadataMode =
	| { readonly kind: 'manual' }
	| { readonly kind: 'schema'; readonly schema: JsonSchemaValue };

interface MetadataRow {
	readonly id: string;
	readonly key: string;
	readonly label: string;
	readonly required: boolean;
	readonly value: string;
	readonly valueType: MetadataValueType;
}

type MetadataValueType = 'text' | 'number' | 'integer' | 'boolean' | 'date';

export interface MetadataFieldProps extends BaseFieldProps {
	readonly className?: string | undefined;
	readonly mode?: MetadataMode | undefined;
}

const AddIcon = iconRegistry.actions.add.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

export function MetadataField({
	label,
	description,
	disabled,
	className,
	mode = { kind: 'manual' },
}: MetadataFieldProps) {
	const field = useFieldContext<MetadataValue>();
	const [rows, setRows] = useState<readonly MetadataRow[]>(() =>
		metadataRowsFromValue(field.state.value, mode),
	);
	const committedValue = useRef(metadataKey(field.state.value, mode));

	useEffect(() => {
		const nextValue = metadataKey(field.state.value, mode);
		if (nextValue !== committedValue.current) {
			committedValue.current = nextValue;
			setRows(metadataRowsFromValue(field.state.value, mode));
		}
	}, [field.state.value, mode]);

	function commitRows(nextRows: readonly MetadataRow[]) {
		const nextValue = metadataValueFromRows(nextRows, mode);
		committedValue.current = metadataKey(nextValue, mode);
		setRows(nextRows);
		field.handleChange(nextValue);
	}

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			renderControl={(controlProps) => (
				<div
					{...controlProps}
					className={['grid gap-2 rounded-md border border-border/30 bg-muted/20 p-2.5', className]
						.filter(Boolean)
						.join(' ')}
				>
					{rows.length === 0 ? (
						<p className="m-0 rounded-md bg-background/70 px-2.5 py-2 text-[0.84rem] text-muted-foreground">
							No metadata fields.
						</p>
					) : (
						rows.map((row) => (
							<section
								className="grid gap-2 rounded-md border border-border/30 bg-background p-2.5"
								key={row.id}
							>
								{mode.kind === 'manual' ? (
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
													commitRows(
														rows.map((current) =>
															current.id === row.id
																? { ...current, label: event.target.value, key: event.target.value }
																: current,
														),
													)
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
												onChange={(event) =>
													commitRows(
														rows.map((current) =>
															current.id === row.id
																? { ...current, value: event.target.value }
																: current,
														),
													)
												}
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
								) : (
									<SchemaMetadataControl
										disabled={disabled}
										onBlur={field.handleBlur}
										onChange={(value) =>
											commitRows(
												rows.map((current) =>
													current.id === row.id ? { ...current, value } : current,
												),
											)
										}
										row={row}
									/>
								)}
							</section>
						))
					)}
					{mode.kind === 'manual' ? (
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

function metadataRowsFromValue(value: MetadataValue, mode: MetadataMode): readonly MetadataRow[] {
	const objectValue = isPlainJsonObject(value) ? value : {};
	if (mode.kind === 'schema') {
		return schemaRows(mode.schema, objectValue);
	}

	return Object.entries(objectValue).map(([key, rawValue]) => ({
		id: crypto.randomUUID(),
		key,
		label: key,
		required: false,
		value: rawValue === null || rawValue === undefined ? '' : String(rawValue),
		valueType: 'text',
	}));
}

function metadataValueFromRows(rows: readonly MetadataRow[], mode: MetadataMode): MetadataValue {
	const entries: Array<readonly [string, unknown]> = [];
	const usedKeys = new Set<string>();
	for (const row of rows) {
		const keySource = mode.kind === 'manual' ? row.label : row.key;
		const key = uniqueFieldKey(fieldKeyFromLabel(keySource), usedKeys);
		if (key.length === 0 || row.value.trim().length === 0) {
			continue;
		}
		entries.push([key, valueFromRow(row)]);
	}

	return entries.length === 0 ? null : Object.fromEntries(entries);
}

function schemaRows(
	schema: JsonSchemaValue,
	value: Record<string, unknown>,
): readonly MetadataRow[] {
	if (!isPlainJsonObject(schema)) {
		return [];
	}

	if (isPlainJsonObject(schema.properties)) {
		return rowsFromJsonSchema(schema, value);
	}

	return Object.entries(schema)
		.map(([key, config]) => {
			const configObject = isPlainJsonObject(config) ? config : {};
			return {
				id: crypto.randomUUID(),
				key,
				label: typeof configObject.label === 'string' ? configObject.label : labelFromFieldKey(key),
				order: numericOrder(configObject.order),
				required: configObject.required === true,
				value: value[key] === null || value[key] === undefined ? '' : String(value[key]),
				valueType: metadataValueTypeFromValue(configObject.type),
			};
		})
		.sort((first, second) => first.order - second.order);
}

function rowsFromJsonSchema(
	schema: Record<string, unknown>,
	value: Record<string, unknown>,
): readonly MetadataRow[] {
	const properties = isPlainJsonObject(schema.properties) ? schema.properties : {};
	const required = Array.isArray(schema.required)
		? new Set(schema.required.filter((item): item is string => typeof item === 'string'))
		: new Set<string>();

	return Object.entries(properties).map(([key, property]) => ({
		id: crypto.randomUUID(),
		key,
		label: labelFromFieldKey(key),
		required: required.has(key),
		value: value[key] === null || value[key] === undefined ? '' : String(value[key]),
		valueType: metadataValueTypeFromProperty(property),
	}));
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

function metadataValueTypeFromProperty(schema: unknown): MetadataValueType {
	if (!isPlainJsonObject(schema)) {
		return 'text';
	}
	if (schema.type === 'string' && schema.format === 'date') {
		return 'date';
	}
	return metadataValueTypeFromValue(schema.type);
}

function metadataValueTypeFromValue(value: unknown): MetadataValueType {
	if (value === 'string' || value === 'text') {
		return 'text';
	}

	return value === 'number' || value === 'integer' || value === 'boolean' || value === 'date'
		? value
		: 'text';
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
	while (key.length > 0 && usedKeys.has(key)) {
		key = `${baseKey} ${suffix}`;
		suffix += 1;
	}
	if (key.length > 0) {
		usedKeys.add(key);
	}
	return key;
}

function labelFromFieldKey(key: string): string {
	const spaced = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();
	return spaced.length === 0 ? '' : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function numericOrder(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function metadataKey(value: MetadataValue, mode: MetadataMode): string {
	return `${mode.kind}:${mode.kind === 'schema' ? JSON.stringify(mode.schema) : ''}:${value === null ? 'null' : JSON.stringify(value)}`;
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
