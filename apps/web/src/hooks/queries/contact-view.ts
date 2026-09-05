/**
 * What a Contact looks like above the query layer.
 *
 * Not a hook, so not a `use-` file: several hooks in this folder return this one.
 *
 * ## Why the name is still four columns
 *
 * A Contact is whoever the organization has a way of reaching, and which way
 * that is varies: a resident who left a phone number, a property manager known
 * by their company, an email address and nothing else. `contactDisplayName` in
 * `routes/public-engagement/-public-engagement-display.ts` takes the first of
 * name, company, email, phone that is not blank, and falls back to a short id.
 *
 * That is four `coalesce` branches and a substring, and the expression language
 * has no substring — the same wall `trapDisplayName` and `Sample.name` hit. So
 * the columns ride up as they are and the shared helper composes them.
 */

/** Enough to name a Contact and say how to reach them. */
export interface ContactSummary {
	readonly id: string;
	readonly contactName: string | null;
	readonly company: string | null;
	readonly email: string | null;
	readonly preferredPhone: string | null;
}

/**
 * A Contact as it arrives joined onto something else.
 *
 * Every field is optionally `undefined` because that is what an unmatched `left`
 * join yields — the same shape and the same reason as `LinkedAddress`, which
 * `address-view.ts` explains at length. `id` is the discriminator: the one field
 * a real row cannot have null, so `id === undefined` means "still streaming"
 * rather than "no contact".
 *
 * Written out rather than `Partial<ContactSummary>`: under
 * `exactOptionalPropertyTypes` an optional `id?: string` rejects an explicit
 * `undefined`, which is exactly the value the projection produces.
 */
export interface LinkedContact {
	readonly id: string | undefined;
	readonly contactName: string | null | undefined;
	readonly company: string | null | undefined;
	readonly email: string | null | undefined;
	readonly preferredPhone: string | null | undefined;
}

/**
 * The joined contact as `contactDisplayName` wants it, or `undefined` while it is
 * still streaming.
 */
export function resolveLinkedContact(contact: LinkedContact): ContactSummary | undefined {
	return contact.id === undefined
		? undefined
		: {
				id: contact.id,
				contactName: contact.contactName ?? null,
				company: contact.company ?? null,
				email: contact.email ?? null,
				preferredPhone: contact.preferredPhone ?? null,
			};
}

/** A Contact, as the surfaces that show one whole want it. */
export interface Contact extends ContactSummary {
	readonly alternatePhone: string | null;
	readonly department: string | null;
	readonly title: string | null;
	readonly wantsEmail: boolean;
	readonly wantsSms: boolean;
	readonly wantsPhone: boolean;
	readonly metadata: unknown;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
}
