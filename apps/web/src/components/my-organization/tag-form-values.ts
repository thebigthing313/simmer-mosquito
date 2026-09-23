import type { TagFields } from '../../hooks/mutations/use-tag-mutations';
import type { TagRecord } from '../../hooks/queries/use-tag-catalog';
import { relevanceForSave } from '../../lib/tag-relevance';
import type { TagFormValues } from './types';

/**
 * A Tag as its inline form holds one, and back: a `null` colour is no colour,
 * and an input can hold only a string.
 */
export function tagFormValues(tag: TagRecord): TagFormValues {
	return {
		tagName: tag.name,
		description: tag.description ?? '',
		color: tag.color ?? '',
		isActive: tag.isActive,
		relevantEntityTypes: tag.relevantEntityTypes,
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
		// Register order, and all six as none, which is what the server stores
		// whatever it is sent. A save that reordered nothing then compares equal to
		// what it started from, and one that ticked every box does too.
		relevantEntityTypes: relevanceForSave(values.relevantEntityTypes),
	};
}
