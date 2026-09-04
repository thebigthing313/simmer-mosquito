import type { Contact } from '@simmer-mosquito/sync';
import { ilike, or, useLiveQuery } from '@tanstack/react-db';
import { useDeferredValue, useRef, useState } from 'react';
import { contacts } from '../../lib/collections/contacts';
import { OptionRow, PickerFallback, PickerFrame, useSelectedRowLabel } from './entity-picker';

// Contacts sync on demand, so the results come from a live subset query (an `ilike`
// across the identity fields) rather than a client-side filter over an eager set.
// Rendering this picker also keeps the contacts stream warm for a nearby write.

const searchGcTimeMs = 30_000;

/**
 * What the picker hands back.
 *
 * The four identity columns, in the order a contact is named by — a caller who
 * left only a number is still a contact, and the label falls through to it.
 */
export interface ContactOption {
	readonly id: string;
	readonly contactName: string | null;
	readonly company: string | null;
	readonly email: string | null;
	readonly preferredPhone: string | null;
}

export function ContactPicker({
	label = 'Contact',
	organizationId,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (contact: ContactOption | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [pickedLabel, setPickedLabel] = useState('');
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);
	// An edit form arrives holding only the contact id, so the current selection is
	// resolved from the collection rather than left as an empty-looking field.
	const selectedLabel = useSelectedRowLabel({
		collection: contacts(),
		pickedLabel,
		toLabel: (row) => contactLabel(contactLabelParts(row)),
		value,
	});

	return (
		<PickerFrame
			anchorRef={anchorRef}
			label={label}
			onClear={() => {
				setPickedLabel('');
				setSearch('');
				onSelect(null);
			}}
			onOpen={() => setOpen(true)}
			onOpenChange={setOpen}
			onSearchChange={(next) => {
				setSearch(next);
				setOpen(true);
			}}
			open={open}
			placeholder="Search contacts"
			search={search}
			selectedLabel={selectedLabel}
			value={value}
		>
			<ContactResults
				onSelect={(contact) => {
					const name = contactLabel(contact);
					setPickedLabel(name);
					setSearch(name);
					onSelect(contact);
					setOpen(false);
				}}
				organizationId={organizationId}
				search={deferredSearch}
				selectedValue={value}
			/>
		</PickerFrame>
	);
}

function ContactResults({
	organizationId,
	search,
	selectedValue,
	onSelect,
}: {
	readonly organizationId: string;
	readonly search: string;
	readonly selectedValue: string | null;
	readonly onSelect: (contact: ContactOption) => void;
}) {
	const normalized = search.trim();
	const pattern = `%${normalized}%`;
	const { data, isReady, isError } = useLiveQuery(
		{
			gcTime: searchGcTimeMs,
			query: (query) => {
				// No organization predicate: the shape is scoped to the agency
				// server-side, so re-stating it here is redundant — and a stale column
				// spelling in one is what empties a list rather than narrowing it.
				const base = query.from({ contact: contacts() });
				const filtered =
					normalized.length === 0
						? base
						: base.where(({ contact }) =>
								or(
									ilike(contact.contact_name, pattern),
									ilike(contact.company, pattern),
									ilike(contact.email, pattern),
								),
							);
				return filtered
					.orderBy(({ contact }) => contact.contact_name, 'asc')
					.limit(8)
					.select(({ contact }) => ({
						id: contact.id,
						contactName: contact.contact_name,
						company: contact.company,
						email: contact.email,
						preferredPhone: contact.preferred_phone,
					}));
			},
		},
		[organizationId, pattern],
	);

	if (isError) {
		return <PickerFallback label="Contacts unavailable" />;
	}
	if (!isReady && (data ?? []).length === 0) {
		return <PickerFallback label="Searching contacts" />;
	}
	const matches = data ?? [];
	if (matches.length === 0) {
		return <PickerFallback label="No contact matches" />;
	}

	return (
		<div className="grid gap-1">
			{matches.map((contact) => (
				<OptionRow
					key={contact.id}
					onSelect={() => onSelect(contact)}
					primary={contactLabel(contact)}
					secondary={contactChannel(contact)}
					selected={contact.id === selectedValue}
				/>
			))}
		</div>
	);
}

/**
 * The selected row, as the label formatters take it.
 *
 * `useSelectedRowLabel` hands back the collection's own row, which is spelled the
 * way Postgres spells it; everything above the read seam is named for the domain.
 * This is the one place the two meet — the same seam `addressLabelParts` sits on.
 */
function contactLabelParts(row: Contact): ContactOption {
	return {
		id: row.id,
		contactName: row.contact_name,
		company: row.company,
		email: row.email,
		preferredPhone: row.preferred_phone,
	};
}

/** Self-contained label (kept off the routes layer so the picker stays reusable). */
function contactLabel(contact: ContactOption): string {
	return (
		firstNonEmpty(contact.contactName, contact.company, contact.email, contact.preferredPhone) ??
		`Contact ${contact.id.slice(0, 8)}`
	);
}

function contactChannel(contact: ContactOption): string | null {
	return firstNonEmpty(contact.email, contact.preferredPhone, contact.company);
}

function firstNonEmpty(...values: readonly (string | null)[]): string | null {
	for (const value of values) {
		if (value !== null && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
}
