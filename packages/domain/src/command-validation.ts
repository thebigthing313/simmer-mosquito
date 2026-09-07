import type {
	DomainId,
	GeoJsonPoint,
	LocalDateString,
	OwnedGeoJsonGeometryFor,
	OwnedGeometryKind,
} from './shared.js';
import {
	DomainValidationError,
	type DomainValidationIssue,
	type JsonObject,
	normalizeOwnedGeometry,
} from './shared.js';

export interface OrganizationCommandContextInput {
	readonly organizationId: string | null | undefined;
	readonly actorProfileId: string | null | undefined;
}

export interface OrganizationCommandContextPayload {
	readonly organizationId: string;
	readonly actorProfileId: string;
}

export interface OperatorCommandContextInput {
	readonly operatorUserId: string | null | undefined;
}

export interface OperatorCommandContextPayload {
	readonly operatorUserId: string;
}

export function createIssues(): DomainValidationIssue[] {
	return [];
}

export function validateOrganizationCommandContext(
	input: OrganizationCommandContextInput,
	issues: DomainValidationIssue[],
): OrganizationCommandContextPayload {
	return {
		organizationId: requiredUuid(input.organizationId, 'organizationId', issues),
		actorProfileId: requiredUuid(input.actorProfileId, 'actorProfileId', issues),
	};
}

export function validateOperatorCommandContext(
	input: OperatorCommandContextInput,
	issues: DomainValidationIssue[],
): OperatorCommandContextPayload {
	return {
		operatorUserId: requiredUuid(input.operatorUserId, 'operatorUserId', issues),
	};
}

export function requiredUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string {
	const normalized = optionalId(value);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return '';
	}
	if (!isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
	return normalized;
}

export function optionalUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = optionalId(value);
	if (normalized !== null && !isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
	return normalized;
}

export function actorDefaultProfileId(
	value: string | null | undefined,
	actorProfileId: string,
): string {
	return optionalId(value) ?? requiredId(actorProfileId);
}

export function requiredId(value: string | null | undefined): string {
	return optionalId(value) ?? '';
}

export function optionalId(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

export function requiredText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength?: number,
): string {
	const normalized = nullableText(value, path, issues, maxLength);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return '';
	}
	return normalized;
}

export function nullableText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength?: number,
): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (maxLength !== undefined && trimmed.length > maxLength) {
		issues.push({ path, message: `${path} must be ${maxLength} characters or fewer.` });
	}
	return trimmed;
}

export function jsonObject(
	value: unknown | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): JsonObject | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'object' || Array.isArray(value)) {
		issues.push({ path, message: `${path} must be a JSON object or null.` });
		return null;
	}
	return value as JsonObject;
}

/**
 * A calendar date the command may carry, in any direction.
 *
 * Shape and calendar validity only — an assignment is due in the future and a
 * forecast describes one, so nothing here rejects a date for being ahead of
 * today. Operational dates that record something already observed want
 * `validateNotFutureLocalDate` instead.
 */
export function validateLocalDate(
	value: LocalDateString | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		issues.push({ path, message: `${path} must be a YYYY-MM-DD date string.` });
		return;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		issues.push({ path, message: `${path} must be a valid calendar date.` });
	}
}

/**
 * A calendar date for work that has already happened.
 *
 * A trap was collected, a habitat was inspected, a sample was identified — none
 * of which can be true of tomorrow, so a future date is a typo rather than a
 * plan. Surveillance commands validate their operational dates through here.
 *
 * This lived as a second, identically-named `validateLocalDate` inside the adult
 * and larval `shared.ts` modules, which made the difference between the two
 * rules invisible at every call site and ambiguous through the package barrel.
 * The name now says which rule is being applied.
 */
export function validateNotFutureLocalDate(
	value: LocalDateString | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	const before = issues.length;
	validateLocalDate(value, path, issues);
	if (issues.length > before || value === undefined) {
		return;
	}

	const today = new Date().toISOString().slice(0, 10);
	if (value > today) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
}

/**
 * How far ahead of the server a client-supplied instant may sit before it counts
 * as being in the future.
 *
 * Lifecycle and progress commands carry timestamps the *client* stamped — a
 * phone that finished a stop, a tablet replaying an offline queue — and consumer
 * clocks drift. Compared against a bare `Date.now()`, a device even slightly
 * fast fails every one of those commands, which reads as a broken app rather
 * than a clock problem. The allowance is wide enough to absorb ordinary drift
 * and narrow enough that a genuinely future-dated entry is still rejected.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * Whether an instant sits far enough ahead of the server to reject.
 *
 * The single place the tolerance is applied, so every domain's future check
 * agrees on what "in the future" means.
 */
export function isFutureBeyondClockSkew(value: Date, now: number = Date.now()): boolean {
	return value.getTime() > now + CLOCK_SKEW_TOLERANCE_MS;
}

/**
 * The organization context on a command, validated.
 *
 * Seven domains declared this as `validateBase` and two as
 * `validateOrganizationBase`, all nine with the same body.
 */
export function validateOrganizationBase(
	input: OrganizationCommandContextInput,
	issues: DomainValidationIssue[],
): void {
	validateOrganizationCommandContext(input, issues);
}

/**
 * {@link validateOrganizationBase} under the name most domains spell it.
 *
 * Two names for one rule. Seven domains have only organization-scoped commands
 * and call it `validateBase`; `foundation` also has operator-scoped ones and
 * needs the longer name to tell the two apart, and `identity` followed it. One
 * declaration and an alias rather than a rename, because the rename is 83 call
 * sites and belongs with the `requiredUuid` naming sweep.
 */
export const validateBase = validateOrganizationBase;

/**
 * A command whose payload is the organization context plus one id.
 *
 * Generic over the input so a domain keeps its own command-input type at the
 * call site, and `idKey` names the field to require, which is what makes the
 * eight copies one function. `field-work` took `requireUuid` as a parameter and
 * nothing ever varied it, so the parameter is gone rather than moved.
 */
export function validateOrganizationIdCommand<T extends OrganizationCommandContextInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateOrganizationBase(input, issues);
	requiredUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

/** {@link validateOrganizationIdCommand} under the name most domains spell it. */
export const validateIdCommand = validateOrganizationIdCommand;

/**
 * The organization context on a command, as the payload carries it.
 *
 * The issues are discarded because the caller has already validated the same
 * two fields through {@link validateOrganizationBase} and thrown on what it
 * found; this is the normalization half. `identity` built the payload by hand
 * instead and so skipped the trim, and this is the body the other eight ran.
 */
export function organizationPayload(
	input: OrganizationCommandContextInput,
): OrganizationCommandContextPayload {
	return validateOrganizationCommandContext(input, createIssues());
}

/** {@link organizationPayload} under the name most domains spell it. */
export const basePayload = organizationPayload;

/**
 * A required id as the payload carries it: trimmed, and empty as `''`.
 *
 * `foundation` and `weather` each wrapped {@link requiredId} under this name.
 */
export function normalizeRequiredDomainId(value: DomainId): DomainId {
	return requiredId(value);
}

/**
 * Free text as the payload carries it: trimmed, and empty as `null`.
 *
 * The same trim {@link optionalId} applies to an id, under the name the two
 * surveillance domains spell it. {@link nullableText} beside it is a different
 * rule: it takes a `path` because it reports a value over `maxLength` as an
 * issue, and this one has no length to report against.
 */
export function normalizeNullableText(value: string | null | undefined): string | null {
	return optionalId(value);
}

/**
 * A non-empty list of distinct ids.
 *
 * Every element is reported by index, so a caller sees which id was wrong rather
 * than that one of them was. Four domains declared this; `field-work`'s copy
 * took `requireUuid` as a parameter and nothing ever varied it.
 */
export function validateIdList(
	values: readonly DomainId[],
	path: string,
	issues: DomainValidationIssue[],
): readonly DomainId[] {
	if (!Array.isArray(values) || values.length === 0) {
		issues.push({ path, message: `${path} must include at least one id.` });
		return [];
	}
	const seen = new Set<string>();
	return values.map((value, index) => {
		requiredUuid(value, `${path}.${index}`, issues);
		const normalized = requiredId(value);
		if (seen.has(normalized)) {
			issues.push({ path: `${path}.${index}`, message: `${path} must not contain duplicates.` });
		}
		seen.add(normalized);
		return normalized;
	});
}

/**
 * A value the command accepts only from a fixed list.
 *
 * The first allowed value comes back when the check fails, so the payload still
 * has the shape its type promises while the issue is what stops the command.
 */
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

/**
 * An instant the command may carry: absent, or a valid Date, and not in the
 * future unless `allowFuture` says it may be.
 *
 * The future check runs through {@link isFutureBeyondClockSkew}, so a device
 * whose clock is slightly fast is not refused. Four domains declared this and
 * three of the bodies differed. `public-engagement`'s had no `allowFuture` and
 * compared against a bare `Date.now()`, which is the refusal issue #625
 * describes; `mission-dispatch`'s handed an invalid Date back as `new Date(0)`
 * rather than `null`, which nothing could observe because the issue beside it
 * stops the command. This is the body the other two ran.
 */
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

/**
 * A record kind whose geometry policy is a Point and nothing else.
 *
 * Read off the register rather than listed, so widening a kind's policy takes it
 * out of this set and fails {@link validatePointGeometry}'s call site, instead
 * of leaving a return type saying Point about a row that can hold a line.
 */
export type PointGeometryKind = {
	[Kind in OwnedGeometryKind]: OwnedGeoJsonGeometryFor<Kind> extends GeoJsonPoint ? Kind : never;
}[OwnedGeometryKind];

/**
 * A Point geometry the record kind may store, reported as issues rather than
 * thrown.
 *
 * `foundation` and `weather` held one copy each and differed in a single
 * string, the kind they passed to {@link normalizeOwnedGeometry}, so the kind is
 * an argument here and `'address'` and `'weatherStation'` are call sites.
 */
export function validatePointGeometry(
	kind: PointGeometryKind,
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPoint {
	try {
		return normalizeOwnedGeometry(kind, value, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

export function throwIfIssues(message: string, issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(message, issues);
	}
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
