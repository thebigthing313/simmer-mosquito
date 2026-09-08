'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useEffect, useId, useRef, useState } from 'react';
import { useFieldContext } from '../form-contexts';
import type { MetadataValue, MetadataValueType } from './custom-schema';
import { customFieldDescriptors, customSchemaFromFields, isPlainJsonObject } from './custom-schema';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export type JsonSchemaValue = MetadataValue;

/**
 * One row of the editor. `key` is where the field's answers are already stored,
 * carried through every edit so renaming a field never moves them; it is null
 * only for a field somebody has just added, which gets a key from its label.
 * `id` is the React key and nothing else. Display order is the row's position.
 */
interface CustomFieldRow {
	readonly id: string;
	readonly key: string | null;
	readonly name: string;
	readonly required: boolean;
	readonly valueType: MetadataValueType;
}

export interface JsonSchemaFieldProps extends BaseFieldProps {
	readonly className?: string | undefined;
}

const AddIcon = iconRegistry.actions.add.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const MoveDownIcon = iconRegistry.arrows.chevronDown.icon;
const MoveUpIcon = iconRegistry.arrows.chevronUp.icon;

const valueTypeOptions: readonly { readonly label: string; readonly value: MetadataValueType }[] = [
	{ label: 'Text', value: 'text' },
	{ label: 'Number', value: 'number' },
	{ label: 'Whole number', value: 'integer' },
	{ label: 'Yes / no', value: 'boolean' },
	{ label: 'Date', value: 'date' },
];

export function JsonSchemaField({
	label,
	description,
	disabled,
	required,
	className,
}: JsonSchemaFieldProps) {
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
		const nextValue = customSchemaFromFields(
			nextRows.map((row) => ({
				key: row.key,
				label: row.name,
				required: row.required,
				valueType: row.valueType,
			})),
		);
		committedSchema.current = schemaKey(nextValue);
		setRows(nextRows);
		field.handleChange(nextValue);
	}

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
																	valueType: event.target.value as MetadataValueType,
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
									key: null,
									name: '',
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
						Add Field
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

/** The editor's rows for a stored schema, each holding the key it is stored under. */
function customFieldRowsFromSchema(value: JsonSchemaValue): readonly CustomFieldRow[] {
	return customFieldDescriptors(value).map((descriptor) => ({
		id: crypto.randomUUID(),
		key: descriptor.key,
		name: descriptor.label,
		required: descriptor.required,
		valueType: descriptor.valueType,
	}));
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

function schemaKey(value: JsonSchemaValue): string {
	return value === null ? 'null' : JSON.stringify(value);
}
