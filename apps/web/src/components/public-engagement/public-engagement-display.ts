// Shared label and formatting helpers for the public-engagement routes. Every
// parameter is structural rather than a row type, so both read paths satisfy
// it.

import { formatPhoneNumber } from '@simmer-mosquito/ui-web/lib/phone-number';
import { countPhrase } from '../../lib/format-count';
import { calendarDateParts, utcCalendarDay } from '../../lib/local-date';
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
		firstNonEmpty(
			contact.contactName,
			contact.company,
			contact.email,
			formatPhoneNumber(contact.preferredPhone),
		) ?? `Contact ${contact.id.slice(0, 8)}`
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
	const parts = [contact.company, contact.email, formatPhoneNumber(contact.preferredPhone)].filter(
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

/** `24 people`: outreach is counted in people reached, never a volume. */
export function formatReach(reach: number): string {
	return reach === 1 ? '1 person' : `${reach.toLocaleString('en-US')} people`;
}

/**
 * A request is open until it is closed; deletion is a separate soft state.
 * `closedAt` is a `Date` off the query hooks and a string on the older read
 * paths; only its presence is read.
 */
export function isServiceRequestOpen(request: {
	readonly closedAt: Date | string | null;
}): boolean {
	return request.closedAt === null;
}

/**
 * Format a `YYYY-MM-DD` request date as a readable, timezone-stable label.
 * The `Date` is a local one and the formatter names no zone, so the day is
 * the day recorded.
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

const DAY_MS = 86_400_000;
const DAY_NOUN = { one: 'day', many: 'days' } as const;

/**
 * How long an open request has waited: `Today`, `1 day`, `12 days`.
 *
 * Whole calendar days from the request date to `today`, which the caller
 * passes as the Organization's today so the count turns over on its calendar.
 * A request dated after today reads `Today` rather than a negative age.
 */
export function formatRequestAge(requestDate: string, today: string): string {
	const received = calendarDateParts(requestDate);
	if (received === undefined) {
		return unreadable('formatRequestAge', requestDate);
	}
	const now = calendarDateParts(today);
	if (now === undefined) {
		return unreadable('formatRequestAge', today);
	}
	const days = Math.round(
		(utcCalendarDay(now).getTime() - utcCalendarDay(received).getTime()) / DAY_MS,
	);
	return days < 1 ? 'Today' : countPhrase(days, DAY_NOUN);
}

/**
 * What the age slot on a request's row reads: how long an open request has
 * waited, or the day a closed one was received.
 */
export function requestAgeOrDate(
	request: { readonly requestDate: string; readonly closedAt: Date | string | null },
	today: string,
): string {
	return isServiceRequestOpen(request)
		? formatRequestAge(request.requestDate, today)
		: formatRequestDate(request.requestDate);
}

function firstNonEmpty(...values: readonly (string | null)[]): string | null {
	for (const value of values) {
		if (value !== null && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
}
