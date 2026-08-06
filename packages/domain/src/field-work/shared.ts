import {
	createIssues,
	isFutureBeyondClockSkew,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	validateAgencyCommandContext,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';

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

export type RouteItemTargetType = 'trap' | 'habitat';
export type RouteType = RouteItemTargetType;
export type AssignmentItemTargetType = 'trap' | 'habitat' | 'serviceRequest';

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
	| 'fieldWork.unskipAssignmentItem';

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

export const ADDITIONAL_PERSONNEL_TARGET_TYPES = [
	'inspection',
	'collection',
	'application',
	'sourceReduction',
	'outreachAction',
	'biocontrolAction',
] as const;

export const ROUTE_ITEM_TARGET_TYPES = ['trap', 'habitat'] as const;
export const ASSIGNMENT_ITEM_TARGET_TYPES = ['trap', 'habitat', 'serviceRequest'] as const;
export const ROUTE_TYPES = ['trap', 'habitat'] as const;

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

export function validateBase(input: FieldWorkCommandInput, issues: DomainValidationIssue[]): void {
	validateAgencyCommandContext(input, issues);
}

export function validateIdCommand<T extends FieldWorkCommandInput>(
	input: T,
	idKey: keyof T & string,
	requireUuid: (value: string | undefined, path: string, issues: DomainValidationIssue[]) => void,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

export function basePayload(input: FieldWorkCommandInput): FieldWorkCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

export function normalizeOptionalTimestamp(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	allowFuture: boolean,
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return null;
	}
	if (!allowFuture && isFutureBeyondClockSkew(value)) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
	return value;
}

export function normalizeStringUnion<TValue extends string>(
	value: string | undefined,
	allowedValues: readonly TValue[],
	path: string,
	issues: DomainValidationIssue[],
): TValue {
	if (value === undefined || !allowedValues.includes(value as TValue)) {
		issues.push({ path, message: `${path} is not supported.` });
		return (allowedValues[0] ?? '') as TValue;
	}
	return value as TValue;
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

export function validateIdList(
	values: readonly DomainId[],
	path: string,
	issues: DomainValidationIssue[],
	requireUuid: (value: string | undefined, path: string, issues: DomainValidationIssue[]) => void,
): readonly DomainId[] {
	if (!Array.isArray(values) || values.length === 0) {
		issues.push({ path, message: `${path} must include at least one id.` });
		return [];
	}
	const seen = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value, `${path}.${index}`, issues);
		const normalized = normalizeRequiredId(value);
		if (seen.has(normalized)) {
			issues.push({ path: `${path}.${index}`, message: `${path} must not contain duplicates.` });
		}
		seen.add(normalized);
		return normalized;
	});
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
