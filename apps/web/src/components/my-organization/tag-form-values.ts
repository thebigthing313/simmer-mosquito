import type { TagFields } from '../../hooks/mutations/use-tag-mutations';
import type { TagRecord } from '../../hooks/queries/use-tag-catalog';
import type { TagFormValues } from './types';

/**
 * A Tag as its inline form holds one, and back.
 *
 * The boundary between what the row shows — a `null` colour is no colour — and
 * what an input can hold, which is only ever a string.
 */
export function tagFormValues(tag: TagRecord): TagFormValues {
	return {
		tagName: tag.name,
		description: tag.description ?? '',
		color: tag.color ?? '',
		isActive: tag.isActive,
	};
}

export function tagFieldsFrom(values: TagFormValues): TagFields {
	const description = values.description.trim();
	const color = values.color.trim();
	return {
		name: values.tagName.trim(),
		description: description.length === 0 ? null : description,
		color: color.length === 0 ? null : color,
		isActive: values.isActive,
	};
}
