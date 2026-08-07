import type { ContactRow, ServiceRequestRow } from '@simmer-mosquito/sync';

// Shared label + formatting helpers for the public-engagement routes. Dash-prefixed
// so TanStack Router ignores this file as a route.

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
export function contactSecondaryLine(contact: ContactRow): string | null {
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
	return reach === 1 ? '1 person' : `${reach.toLocaleString()} people`;
}

/** A request is open until it is closed; deletion is a separate (soft) state. */
export function isServiceRequestOpen(request: Pick<ServiceRequestRow, 'closedAt'>): boolean {
	return request.closedAt === null;
}

/** Format a `YYYY-MM-DD` request date as a readable, timezone-stable label. */
export function formatRequestDate(value: string): string {
	const [year, month, day] = value.slice(0, 10).split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return value;
	}
	const date = new Date(year, month - 1, day);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return new Intl.DateTimeFormat(undefined, {
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
