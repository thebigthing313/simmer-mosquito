import { ROUTE_TYPES, type RouteType } from '../column-vocabularies.js';
import {
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	normalizeStringUnion,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';

export { ROUTE_TYPES, type RouteType };

export type CommentTargetType =
	| 'address'
	| 'region'
	| 'trap'
	| 'collection'
	| 'habitat'
	| 'inspection'
	| 'sample'
	| 'application'
	| 'sourceReduction'
	| 'outreachAction'
	| 'biocontrolAction'
	| 'contact'
	| 'serviceRequest'
	| 'route'
	| 'assignment'
	| 'requestedControlAction'
	| 'mission';

export type TagTargetType =
	| 'address'
	| 'region'
	| 'trap'
	| 'habitat'
	| 'contact'
	| 'serviceRequest';

export type AdditionalPersonnelTargetType =
	| 'inspection'
	| 'collection'
	| 'application'
	| 'sourceReduction'
	| 'outreachAction'
	| 'biocontrolAction';

/** A Route Item points at a stop of its Route's own kind. */
export type RouteItemTargetType = RouteType;
export type AssignmentItemTargetType = RouteType | 'serviceRequest';

export type FieldWorkCommandType =
	| 'fieldWork.addComment'
	| 'fieldWork.updateComment'
	| 'fieldWork.deleteComment'
	| 'fieldWork.pinComment'
	| 'fieldWork.unpinComment'
	| 'fieldWork.createTag'
	| 'fieldWork.updateTag'
	| 'fieldWork.activateTag'
	| 'fieldWork.deactivateTag'
	| 'fieldWork.deleteTag'
	| 'fieldWork.assignTag'
	| 'fieldWork.unassignTag'
	| 'fieldWork.addAdditionalPersonnel'
	| 'fieldWork.removeAdditionalPersonnel'
	| 'fieldWork.createRoute'
	| 'fieldWork.updateRouteDetails'
	| 'fieldWork.deleteRoute'
	| 'fieldWork.addRouteItem'
	| 'fieldWork.updateRouteItem'
	| 'fieldWork.removeRouteItem'
	| 'fieldWork.moveRouteItems'
	| 'fieldWork.createAssignment'
	| 'fieldWork.createAssignmentFromRoute'
	| 'fieldWork.selfAssignRoute'
	| 'fieldWork.updateAssignmentDetails'
	| 'fieldWork.addAssignmentItem'
	| 'fieldWork.updateAssignmentItem'
	| 'fieldWork.removeAssignmentItem'
	| 'fieldWork.moveAssignmentItems'
	| 'fieldWork.startAssignment'
	| 'fieldWork.completeAssignment'
	| 'fieldWork.cancelAssignment'
	| 'fieldWork.reopenAssignment'
	| 'fieldWork.deleteAssignment'
	| 'fieldWork.completeAssignmentItem'
	| 'fieldWork.reopenAssignmentItem'
	| 'fieldWork.skipAssignmentItem'
	| 'fieldWork.unskipAssignmentItem'
	| 'fieldWork.recordHabitatInspectionForAssignmentItem'
	| 'fieldWork.setTrapCollectionForAssignmentItem'
	| 'fieldWork.collectTrapCollectionForAssignmentItem'
	| 'fieldWork.recordCollectedTrapCollectionForAssignmentItem';

export interface FieldWorkDomainCommand<TType extends FieldWorkCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface FieldWorkCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface FieldWorkCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface EntityTarget<TType extends string> {
	readonly type: TType;
	readonly id: DomainId;
}

export type CommentTarget = EntityTarget<CommentTargetType>;
export type TagTarget = EntityTarget<TagTargetType>;
export type AdditionalPersonnelTarget = EntityTarget<AdditionalPersonnelTargetType>;
export type RouteItemTarget = EntityTarget<RouteItemTargetType>;
export type AssignmentItemTarget = EntityTarget<AssignmentItemTargetType>;

export type RouteItemPlacement =
	| { readonly kind: 'start' }
	| { readonly kind: 'end' }
	| { readonly kind: 'before'; readonly routeItemId: DomainId }
	| { readonly kind: 'after'; readonly routeItemId: DomainId };

export type AssignmentItemPlacement =
	| { readonly kind: 'start' }
	| { readonly kind: 'end' }
	| { readonly kind: 'before'; readonly assignmentItemId: DomainId }
	| { readonly kind: 'after'; readonly assignmentItemId: DomainId };

export interface RouteAssignmentItemIdMapping {
	readonly routeItemId: DomainId;
	readonly assignmentItemId: DomainId;
}

export const COMMENT_TARGET_TYPES = [
	'address',
	'region',
	'trap',
	'collection',
	'habitat',
	'inspection',
	'sample',
	'application',
	'sourceReduction',
	'outreachAction',
	'biocontrolAction',
	'contact',
	'serviceRequest',
	'route',
	'assignment',
	'requestedControlAction',
	'mission',
] as const;

export const TAG_TARGET_TYPES = [
	'address',
	'region',
	'trap',
	'habitat',
	'contact',
	'serviceRequest',
] as const;

/**
 * The same six as `tag_items.entity_type` spells them, derived rather than
 * written again.
 *
 * `tags.relevant_entity_types` holds these words, so a tag picker compares
 * `toDbEntityType(recordType)` against the column with no bridge on the read.
 * The SQL check on that column is the one copy that cannot read this list, and
 * `tag-relevance.integration.test.ts` reads the constraint back out of
 * `pg_constraint` to hold the two together.
 */
export const TAG_TARGET_ENTITY_TYPES: readonly string[] = TAG_TARGET_TYPES.map(toDbEntityType);

/**
 * Which record types a Tag is meant for, as the column stores them.
 *
 * A whole-set replace: the caller sends the set it wants, and naming the field
 * at all is what says it is changing. Deduped, refused by name when it holds
 * something that is not a taggable target, and sorted into register order, so
 * two edits meaning the same set produce the same row and the stored array reads
 * the way the picker lists it.
 *
 * All six collapses to the empty set, because the empty set already means
 * relevant everywhere and one idea with two spellings would owe a branch at
 * every reader. The collapse is here rather than in the client so that every
 * caller gets it, mobile and any later one included.
 *
 * Nothing is enforced by the result. The set is what a picker reads to decide
 * which Tags to offer first, and `assignTag` still accepts any active Tag on any
 * taggable record. See `docs/tag-relevance-spec.md`.
 */
export function normalizeRelevantEntityTypes(
	value: readonly string[] | undefined,
	path: string,
	issues: DomainValidationIssue[],
): readonly string[] {
	if (!Array.isArray(value)) {
		issues.push({ path, message: `${path} must be a list of record types.` });
		return [];
	}

	const named = new Set<string>();
	for (const entry of value) {
		if (typeof entry !== 'string' || !TAG_TARGET_ENTITY_TYPES.includes(entry)) {
			issues.push({ path, message: `${path} names a record type that cannot be tagged.` });
			continue;
		}
		named.add(entry);
	}

	if (named.size === TAG_TARGET_ENTITY_TYPES.length) {
		return [];
	}
	return TAG_TARGET_ENTITY_TYPES.filter((entityType) => named.has(entityType));
}

export const ADDITIONAL_PERSONNEL_TARGET_TYPES = [
	'inspection',
	'collection',
	'application',
	'sourceReduction',
	'outreachAction',
	'biocontrolAction',
] as const;

export const ROUTE_ITEM_TARGET_TYPES = ROUTE_TYPES;
export const ASSIGNMENT_ITEM_TARGET_TYPES = [...ROUTE_TYPES, 'serviceRequest'] as const;

/**
 * Polymorphic tables (`comments`, `tag_items`, `assignment_items`, …) store the
 * `entity_type` discriminator in snake_case, while the domain target-type
 * vocabulary is camelCase (`serviceRequest`, `sourceReduction`, …). Convert a
 * camelCase target type to its snake_case column value; single-word types
 * (`trap`, `habitat`, `contact`) pass through unchanged.
 */
export function toDbEntityType(targetType: string): string {
	return targetType.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

/**
 * The same conversion the other way, for a caller that speaks columns.
 *
 * A client writing one of these tables through a sync collection sends the row
 * as its columns, so the discriminator arrives in the spelling the column holds.
 * The command builders take the domain vocabulary, so something has to turn it
 * back, and doing it here keeps the pair in one place rather than leaving each
 * endpoint to write its own regex.
 *
 * It only changes the spelling. Whether the result is a target type the command
 * accepts is `validateTarget`'s question, and a value that is neither passes
 * through to be refused there by name.
 */
export function fromDbEntityType(entityType: string): string {
	return entityType.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase());
}

export function normalizeHexColor(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 7);
	if (normalized === null) {
		return null;
	}
	if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
		issues.push({ path, message: `${path} must be a #RRGGBB hex color.` });
		return null;
	}
	return normalized.toLowerCase();
}

export function validateTarget<TType extends string>(
	target: EntityTarget<TType>,
	allowedTypes: readonly TType[],
	path: string,
	issues: DomainValidationIssue[],
	requireUuid: (value: string | undefined, path: string, issues: DomainValidationIssue[]) => void,
): EntityTarget<TType> {
	const type = normalizeStringUnion(target?.type, allowedTypes, `${path}.type`, issues);
	requireUuid(target?.id, `${path}.id`, issues);
	return { type, id: normalizeRequiredId(target?.id) };
}

export function validateRoutePlacement(
	placement: RouteItemPlacement | undefined,
	path: string,
	issues: DomainValidationIssue[],
	requireUuid: (value: string | undefined, path: string, issues: DomainValidationIssue[]) => void,
): RouteItemPlacement {
	if (placement === undefined || !['start', 'end', 'before', 'after'].includes(placement.kind)) {
		issues.push({ path, message: 'placement is not supported.' });
		return { kind: 'end' };
	}
	if (placement.kind === 'before' || placement.kind === 'after') {
		requireUuid(placement.routeItemId, `${path}.routeItemId`, issues);
		return { kind: placement.kind, routeItemId: normalizeRequiredId(placement.routeItemId) };
	}
	return { kind: placement.kind };
}

export function validateAssignmentPlacement(
	placement: AssignmentItemPlacement | undefined,
	path: string,
	issues: DomainValidationIssue[],
	requireUuid: (value: string | undefined, path: string, issues: DomainValidationIssue[]) => void,
): AssignmentItemPlacement {
	if (placement === undefined || !['start', 'end', 'before', 'after'].includes(placement.kind)) {
		issues.push({ path, message: 'placement is not supported.' });
		return { kind: 'end' };
	}
	if (placement.kind === 'before' || placement.kind === 'after') {
		requireUuid(placement.assignmentItemId, `${path}.assignmentItemId`, issues);
		return {
			kind: placement.kind,
			assignmentItemId: normalizeRequiredId(placement.assignmentItemId),
		};
	}
	return { kind: placement.kind };
}
