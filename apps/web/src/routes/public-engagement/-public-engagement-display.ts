// Shared label + formatting helpers for the public-engagement routes. Dash-prefixed
// so TanStack Router ignores this file as a route.
//
// Every parameter here is structural rather than a row type, so both read paths
// satisfy it: the camelCase rows the unmigrated surfaces still hold, and the
// projections the query hooks return.

import { calendarDateParts } from '../../lib/local-date';
import { unreadable } from '../../lib/unreadable-input';

/**
 * A stable, human-readable title for a service request: its sequential number as
 * `#123`. The server assigns `displayName` after the write commits, so an
 * optimistic row that hasn't synced yet falls back to a short id.
 */
export function serviceRequestTitle(request: {
	readonly displayName: number | null;
	readonly id: string;
}): string {
	return request.displayName === null ? request.id.slice(0, 8) : `#${request.displayName}`;
}

/** A contact's best available display label, in identity-strength order. */
export function contactDisplayName(contact: {
	readonly contactName: string | null;
	readonly company: string | null;
	readonly email: string | null;
	readonly preferredPhone: string | null;
	readonly id: string;
}): string {
	return (
		firstNonEmpty(contact.contactName, contact.company, contact.email, contact.preferredPhone) ??
		`Contact ${contact.id.slice(0, 8)}`
	);
}

/** Secondary line for a contact row: company (when the name is primary) or channel. */
export function contactSecondaryLine(contact: {
	readonly id: string;
	readonly contactName: string | null;
	readonly company: string | null;
	readonly email: string | null;
	readonly preferredPhone: string | null;
}): string | null {
	const primary = contactDisplayName(contact);
	const parts = [contact.company, contact.email, contact.preferredPhone].filter(
		(part): part is string => part !== null && part.trim().length > 0 && part !== primary,
	);
	return parts.length === 0 ? null : parts.join(' · ');
}

// The one-line full postal address shared by every card (moved to a neutral home
// so surveillance/control cards can render addresses the SR-card way).
export { formatAddressLine, formatAddressLines } from '../../lib/address-format';

const INTAKE_TYPE_LABELS: Readonly<Record<string, string>> = {
	online: 'Online',
	phone: 'Phone',
	'walk-in': 'Walk-in',
	other: 'Other',
};

export function intakeTypeLabel(intakeType: string): string {
	return INTAKE_TYPE_LABELS[intakeType] ?? intakeType;
}

/** `24 people` — outreach is counted in people reached, never a volume. */
export function formatReach(reach: number): string {
	return reach === 1 ? '1 person' : `${reach.toLocaleString('en-US')} people`;
}

/**
 * A request is open until it is closed; deletion is a separate (soft) state.
 *
 * `closedAt` is a `Date` off the query hooks and the raw timestamp string on the
 * surfaces still reading the old collections. Only its presence is read here, so
 * both do.
 */
export function isServiceRequestOpen(request: {
	readonly closedAt: Date | string | null;
}): boolean {
	return request.closedAt === null;
}

/**
 * Format a `YYYY-MM-DD` request date as a readable, timezone-stable label.
 *
 * The `Date` is a local one and the formatter names no zone, so the two cancel
 * and the day is the day that was recorded. This and `formatActionDate` are the
 * two that do it this way round; everything else builds in UTC and formats in
 * UTC, which lands in the same place.
 */
export function formatRequestDate(value: string): string {
	const parts = calendarDateParts(value);
	if (parts === undefined) {
		return unreadable('formatRequestDate', value);
	}
	const date = new Date(parts.year, parts.month - 1, parts.day);
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	}).format(date);
}

function firstNonEmpty(...values: readonly (string | null)[]): string | null {
	for (const value of values) {
		if (value !== null && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
}
