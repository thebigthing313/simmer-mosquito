/**
 * What a catalog dialog holds, between the record it opened on and the write it
 * makes.
 *
 * One shape for all eight catalogs rather than one per catalog, because the
 * differences are entirely in which fields a given dialog *renders*: a lure has
 * no custom schema, a control method has no description, and only a collection
 * method has an action threshold. A field a catalog does not render stays at its
 * default here and is ignored by the write hook, which reads only the columns its
 * table has — so a superset costs nothing and five near-identical types cost a
 * reader five reads.
 *
 * The trimming is the point of {@link catalogFields}. A form holds a description
 * as `''` because an empty input is an empty string; a column holds it as `null`,
 * and the two must not be allowed to mean different things — a save that wrote
 * `''` would make "no description" and "a description of nothing" two states the
 * table can be in.
 */

import type { JsonSchemaValue } from '@simmer-mosquito/ui-web/components/form';
import type { CatalogFields } from '../../hooks/mutations/use-catalog-mutations';
import { jsonObjectValue } from '../../lib/record-display';

/** The union of every field any of the eight catalog dialogs renders. */
export interface CatalogFormValues {
	readonly name: string;
	readonly description: string;
	readonly actionThreshold: number | null;
	readonly customSchema: JsonSchemaValue;
	readonly isActive: boolean;
}

/** What a catalog record looks like to a dialog, whichever catalog it came from. */
export interface CatalogFormRecord {
	readonly name: string;
	readonly description?: string | null;
	readonly actionThreshold?: number | null;
	readonly customSchema?: unknown;
	readonly isActive: boolean;
}

/**
 * Open the dialog on a record, or on a blank one.
 *
 * A new record starts active: every one of these catalogs exists to be picked
 * from, and creating one nobody can pick is not what the Add button is for.
 */
export function catalogFormValues(record: CatalogFormRecord | undefined): CatalogFormValues {
	return {
		name: record?.name ?? '',
		description: record?.description ?? '',
		actionThreshold: record?.actionThreshold ?? null,
		customSchema: jsonObjectValue(record?.customSchema),
		isActive: record?.isActive ?? true,
	};
}

/** The same values as the write hooks take them: trimmed, and empty means absent. */
export function catalogFields(values: CatalogFormValues): CatalogFields {
	const name = values.name.trim();
	if (name.length === 0) {
		throw new Error('Name is required.');
	}
	const description = values.description.trim();
	return {
		name,
		description: description.length === 0 ? null : description,
		actionThreshold: values.actionThreshold,
		customSchema: values.customSchema,
		isActive: values.isActive,
	};
}
