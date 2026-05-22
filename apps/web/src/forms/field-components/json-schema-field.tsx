'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useEffect, useId, useRef, useState } from 'react';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export type JsonSchemaValue = Record<string, unknown> | null;

type CustomFieldType = 'text' | 'number' | 'integer' | 'boolean' | 'date';

interface CustomFieldRow {
	readonly id: string;
	readonly name: string;
	readonly order: number | null;
	readonly required: boolean;
	readonly valueType: CustomFieldType;
}

export interface JsonSchemaFieldProps extends BaseFieldProps {
	readonly className?: string | undefined;
}

const AddIcon = iconRegistry.actions.add.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const MoveDownIcon = iconRegistry.arrows.chevronDown.icon;
const MoveUpIcon = iconRegistry.arrows.chevronUp.icon;

const valueTypeOptions: readonly { readonly label: string; readonly value: CustomFieldType }[] = [
	{ label: 'Text', value: 'text' },
	{ label: 'Number', value: 'number' },
	{ label: 'Whole number', value: 'integer' },
	{ label: 'Yes / no', value: 'boolean' },
	{ label: 'Date', value: 'date' },
];

export function JsonSchemaField({ label, description, disabled, className }: JsonSchemaFieldProps) {
	const field = useFieldContext<JsonSchemaValue>();
	const fieldId = useId();
	const [rows, setRows] = useState<readonly CustomFieldRow[]>(() =>
		customFieldRowsFromSchema(field.state.value),
	);
	const committedSchema = useRef(schemaKey(field.state.value));

	useEffect(() => {
		const nextSchema = schemaKey(field.state.value);
		if (nextSchema !== committedSchema.current) {
			committedSchema.current = nextSchema;
			setRows(customFieldRowsFromSchema(field.state.value));
		}
	}, [field.state.value]);

	function commitRows(nextRows: readonly CustomFieldRow[]) {
		const nextValue = jsonSchemaFromCustomFields(nextRows);
		committedSchema.current = schemaKey(nextValue);
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
							No custom fields.
						</p>
					) : (
						rows.map((row, index) => {
							const nameId = `${fieldId}-${row.id}-name`;
							const typeId = `${fieldId}-${row.id}-type`;
							const requiredId = `${fieldId}-${row.id}-required`;

							return (
								<section
									className="grid gap-2 rounded-md border border-border/30 bg-background p-2.5"
									key={row.id}
								>
									<div className="grid gap-1">
										<label
											className="text-[0.74rem] font-bold text-muted-foreground"
											htmlFor={nameId}
										>
											Field name
										</label>
										<Input
											id={nameId}
											disabled={disabled}
											onBlur={field.handleBlur}
											onChange={(event) =>
												commitRows(
													rows.map((current) =>
														current.id === row.id
															? { ...current, name: event.target.value }
															: current,
													),
												)
											}
											placeholder="e.g. Wing condition"
											value={row.name}
										/>
									</div>
									<div className="grid gap-1">
										<label
											className="text-[0.74rem] font-bold text-muted-foreground"
											htmlFor={typeId}
										>
											Value type
										</label>
										<NativeSelect
											id={typeId}
											disabled={disabled}
											onBlur={field.handleBlur}
											onChange={(event) =>
												commitRows(
													rows.map((current) =>
														current.id === row.id
															? {
																	...current,
																	valueType: event.target.value as CustomFieldType,
																}
															: current,
													),
												)
											}
											value={row.valueType}
										>
											{valueTypeOptions.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</NativeSelect>
									</div>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="flex min-h-9 items-center gap-2 rounded-md border border-border/30 bg-muted/30 px-2.5 text-[0.8rem] font-bold text-muted-foreground">
											<span id={requiredId}>Required</span>
											<Switch
												aria-label={`${row.name.trim().length === 0 ? 'Custom field' : row.name} required`}
												aria-labelledby={requiredId}
												checked={row.required}
												disabled={disabled}
												onBlur={field.handleBlur}
												onCheckedChange={(required) =>
													commitRows(
														rows.map((current) =>
															current.id === row.id ? { ...current, required } : current,
														),
													)
												}
											/>
										</div>
										<div className="flex items-center gap-1.5">
											<Button
												aria-label={`Move ${row.name.trim().length === 0 ? 'custom field' : row.name} up`}
												disabled={disabled || index === 0}
												onClick={() => commitRows(moveRow(rows, index, index - 1))}
												size="icon"
												type="button"
												variant="outline"
											>
												<MoveUpIcon aria-hidden="true" />
											</Button>
											<Button
												aria-label={`Move ${row.name.trim().length === 0 ? 'custom field' : row.name} down`}
												disabled={disabled || index === rows.length - 1}
												onClick={() => commitRows(moveRow(rows, index, index + 1))}
												size="icon"
												type="button"
												variant="outline"
											>
												<MoveDownIcon aria-hidden="true" />
											</Button>
											<Button
												aria-label={`Remove ${row.name.trim().length === 0 ? 'custom field' : row.name}`}
												disabled={disabled}
												onClick={() => commitRows(rows.filter((current) => current.id !== row.id))}
												size="icon"
												type="button"
												variant="destructive"
											>
												<DeleteIcon aria-hidden="true" />
											</Button>
										</div>
									</div>
								</section>
							);
						})
					)}
					<Button
						className="w-fit"
						disabled={disabled}
						onClick={() =>
							commitRows([
								...rows,
								{
									id: crypto.randomUUID(),
									name: '',
									order: null,
									required: false,
									valueType: 'text',
								},
							])
						}
						size="sm"
						type="button"
						variant="outline"
					>
						<AddIcon aria-hidden="true" />
						Add field
					</Button>
				</div>
			)}
		/>
	);
}

export function validateJsonSchemaValue({
	value,
}: {
	readonly value: JsonSchemaValue;
}): string | undefined {
	return value === null || isPlainJsonObject(value)
		? undefined
		: 'Custom fields must be a JSON object or blank.';
}

function customFieldRowsFromSchema(value: JsonSchemaValue): readonly CustomFieldRow[] {
	if (!isPlainJsonObject(value)) {
		return [];
	}

	if (isPlainJsonObject(value.properties)) {
		return customFieldRowsFromJsonSchema(value);
	}

	return Object.entries(value)
		.map(([key, config]) => {
			if (isPlainJsonObject(config)) {
				return {
					id: crypto.randomUUID(),
					name: typeof config.label === 'string' ? config.label : labelFromFieldKey(key),
					order: numericOrder(config.order),
					required: config.required === true,
					valueType: customFieldTypeFromValue(config.type),
				};
			}

			return {
				id: crypto.randomUUID(),
				name: labelFromFieldKey(key),
				order: null,
				required: false,
				valueType: customFieldTypeFromValue(config),
			};
		})
		.sort(compareCustomFieldRows);
}

function moveRow(
	rows: readonly CustomFieldRow[],
	fromIndex: number,
	toIndex: number,
): readonly CustomFieldRow[] {
	if (toIndex < 0 || toIndex >= rows.length) {
		return rows;
	}

	const nextRows = [...rows];
	const [row] = nextRows.splice(fromIndex, 1);
	if (row === undefined) {
		return rows;
	}
	nextRows.splice(toIndex, 0, row);
	return nextRows;
}

function customFieldRowsFromJsonSchema(value: Record<string, unknown>): readonly CustomFieldRow[] {
	const properties = isPlainJsonObject(value.properties) ? value.properties : {};
	const required = Array.isArray(value.required)
		? new Set(value.required.filter((item): item is string => typeof item === 'string'))
		: new Set<string>();

	return Object.entries(properties).map(([name, schema]) => ({
		id: crypto.randomUUID(),
		name: labelFromFieldKey(name),
		order: null,
		required: required.has(name),
		valueType: customFieldTypeFromProperty(schema),
	}));
}

function jsonSchemaFromCustomFields(rows: readonly CustomFieldRow[]): JsonSchemaValue {
	const namedRows = rows.filter((row) => row.name.trim().length > 0);
	if (namedRows.length === 0) {
		return null;
	}

	const customFields: Record<string, unknown> = {};
	const usedKeys = new Set<string>();
	namedRows.forEach((row, index) => {
		const label = row.name.trim();
		customFields[uniqueFieldKey(fieldKeyFromLabel(label), usedKeys)] = {
			label,
			order: index,
			type: row.valueType,
			required: row.required,
		};
	});

	return customFields;
}

function customFieldTypeFromProperty(schema: unknown): CustomFieldType {
	if (!isPlainJsonObject(schema)) {
		return 'text';
	}

	if (schema.type === 'string' && schema.format === 'date') {
		return 'date';
	}

	return customFieldTypeFromValue(schema.type);
}

function customFieldTypeFromValue(value: unknown): CustomFieldType {
	if (value === 'string' || value === 'text') {
		return 'text';
	}

	return value === 'number' || value === 'integer' || value === 'boolean' || value === 'date'
		? value
		: 'text';
}

function numericOrder(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compareCustomFieldRows(first: CustomFieldRow, second: CustomFieldRow): number {
	if (first.order !== null || second.order !== null) {
		return (first.order ?? Number.MAX_SAFE_INTEGER) - (second.order ?? Number.MAX_SAFE_INTEGER);
	}

	return 0;
}

function fieldKeyFromLabel(label: string): string {
	const parts = label
		.trim()
		.split(/[^a-zA-Z0-9]+/g)
		.filter((part) => part.length > 0);
	const [first = 'field', ...rest] = parts;
	const key = [
		first.toLowerCase(),
		...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()),
	].join('');
	return key.length === 0 ? 'field' : key;
}

function uniqueFieldKey(baseKey: string, usedKeys: Set<string>): string {
	let key = baseKey;
	let suffix = 2;
	while (usedKeys.has(key)) {
		key = `${baseKey}${suffix}`;
		suffix += 1;
	}
	usedKeys.add(key);
	return key;
}

function schemaKey(value: JsonSchemaValue): string {
	return value === null ? 'null' : JSON.stringify(value);
}

function labelFromFieldKey(key: string): string {
	const spaced = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();
	if (spaced.length === 0) {
		return '';
	}

	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
