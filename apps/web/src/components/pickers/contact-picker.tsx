import type { ContactRow } from '@simmer-mosquito/sync';
import { and, eq, ilike, or, useLiveQuery } from '@tanstack/react-db';
import { useDeferredValue, useRef, useState } from 'react';
import { webCollections } from '../../sync/webCollections';
import { OptionRow, PickerFallback, PickerFrame } from './entity-picker';

// Contacts sync on demand, so the results come from a live subset query (an `ilike`
// across the identity fields) rather than a client-side filter over an eager set.
// Rendering this picker also keeps the contacts stream warm for a nearby write.

const searchGcTimeMs = 30_000;

export function ContactPicker({
	label = 'Contact',
	organizationId,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (contact: ContactRow | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState('');
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);

	return (
		<PickerFrame
			anchorRef={anchorRef}
			label={label}
			onClear={() => {
				setSelectedLabel('');
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
					setSelectedLabel(name);
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
	readonly onSelect: (contact: ContactRow) => void;
}) {
	const normalized = search.trim();
	const pattern = `%${normalized}%`;
	const { data, isReady, isError } = useLiveQuery(
		{
			gcTime: searchGcTimeMs,
			query: (query) => {
				const base = query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => eq(contact.organizationId, organizationId));
				const filtered =
					normalized.length === 0
						? base
						: base.where(({ contact }) =>
								and(
									eq(contact.organizationId, organizationId),
									or(
										ilike(contact.contactName, pattern),
										ilike(contact.company, pattern),
										ilike(contact.email, pattern),
									),
								),
							);
				return filtered.orderBy(({ contact }) => contact.contactName, 'asc').limit(8);
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
	const contacts = (data ?? []) as readonly ContactRow[];
	if (contacts.length === 0) {
		return <PickerFallback label="No contact matches" />;
	}

	return (
		<div className="grid gap-1">
			{contacts.map((contact) => (
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

/** Self-contained label (kept off the routes layer so the picker stays reusable). */
function contactLabel(contact: ContactRow): string {
	return (
		firstNonEmpty(contact.contactName, contact.company, contact.email, contact.preferredPhone) ??
		`Contact ${contact.id.slice(0, 8)}`
	);
}

function contactChannel(contact: ContactRow): string | null {
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
