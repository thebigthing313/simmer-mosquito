import type { LocalDateString } from './shared.js';
import { DomainValidationError, type DomainValidationIssue, type JsonObject } from './shared.js';

export interface AgencyCommandContextInput {
	readonly organizationId: string | null | undefined;
	readonly actorProfileId: string | null | undefined;
}

export interface AgencyCommandContextPayload {
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

export function validateAgencyCommandContext(
	input: AgencyCommandContextInput,
	issues: DomainValidationIssue[],
): AgencyCommandContextPayload {
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

export function throwIfIssues(message: string, issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(message, issues);
	}
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
