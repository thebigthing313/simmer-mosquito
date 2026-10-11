import { addDays } from '../overview/period.js';
import type { DomainValidationIssue } from '../shared.js';
import {
	DEFAULT_SERVICE_REQUEST_OVERDUE_DAYS,
	MAX_SERVICE_REQUEST_OVERDUE_DAYS,
	type ServiceRequestOverdueDays,
} from './types-and-defaults.js';

/**
 * A threshold as the command and the stored document both carry it: `'off'`,
 * or a whole number of days from 1 to {@link MAX_SERVICE_REQUEST_OVERDUE_DAYS}.
 * Anything else adds one issue at `path` and reads as the default.
 */
export function normalizeServiceRequestOverdueDays(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): ServiceRequestOverdueDays {
	if (value === 'off') {
		return 'off';
	}
	if (
		typeof value !== 'number' ||
		!Number.isInteger(value) ||
		value < 1 ||
		value > MAX_SERVICE_REQUEST_OVERDUE_DAYS
	) {
		issues.push({
			path,
			message: `${path} must be off or a whole number of days from 1 to ${MAX_SERVICE_REQUEST_OVERDUE_DAYS}.`,
		});
		return DEFAULT_SERVICE_REQUEST_OVERDUE_DAYS;
	}
	return value;
}

/**
 * The first request date that is not overdue, given the Organization's today
 * (`YYYY-MM-DD`) and its threshold, or `null` when the threshold is off.
 *
 * A request's age is whole days from its request date to today, and it is
 * overdue when that age is greater than the threshold, so an open request is
 * overdue exactly when its request date falls before this day. The explorers
 * send it to the server as `overdueBefore`, which is the same comparison in SQL.
 */
export function serviceRequestOverdueCutoff(
	threshold: ServiceRequestOverdueDays,
	today: string,
): string | null {
	return threshold === 'off' ? null : addDays(today, -threshold);
}

/**
 * Whether a request is overdue: open, a threshold on, and received before the
 * cut-off {@link serviceRequestOverdueCutoff} returns. A closed request is never
 * overdue. `closedAt` is a `Date` or a string depending on the read path, and
 * only its presence is read.
 */
export function isServiceRequestOverdue(
	request: { readonly requestDate: string; readonly closedAt: Date | string | null },
	cutoff: string | null,
): boolean {
	return cutoff !== null && request.closedAt === null && request.requestDate < cutoff;
}
