/**
 * The agency's contact list: adding whoever called, correcting them, removing one.
 *
 * ## Who they are and how to reach them are two commands
 *
 * `updateContactDetails` takes the name, company, department and title;
 * `updateContactCommunication` takes the phones, the email, and the three
 * consent flags. The split is not cosmetic — the second half carries consent,
 * and a phone number moving is a different kind of edit from a job title
 * changing.
 *
 * The PATCH this replaces sent all ten fields under one unnamed update and left
 * the server to work out which of the two commands it meant. {@link
 * ContactMutations.save} names one, the other, or both, from what actually
 * changed — so an edit that only fixed a spelling no longer claims to have
 * revisited how the agency may contact somebody.
 *
 * `mergeContacts` is not here. It writes N rows, one per contact folded into the
 * survivor, so it belongs in a transaction rather than a single mutation. It
 * lives in `use-record-merge.ts` with the address and habitat merges, because
 * all three are the same command in three vocabularies.
 */

import { type Contact, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { contacts } from '../../lib/collections/contacts';
import { mutateCollection } from '../../lib/collections/mutate';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { optimisticStamp } from './shared';

/** A Contact as its forms hold one: every field the two update commands take. */
export interface ContactFields {
	readonly contactName: string | null;
	readonly company: string | null;
	readonly department: string | null;
	readonly title: string | null;
	readonly preferredPhone: string | null;
	readonly alternatePhone: string | null;
	readonly email: string | null;
	readonly wantsEmail: boolean;
	readonly wantsSms: boolean;
	readonly wantsPhone: boolean;
}

type ContactUpdateIntent =
	| 'publicEngagement.updateContactDetails'
	| 'publicEngagement.updateContactCommunication';

/** What an edit means, and the columns the commands it names read. */
export interface ContactUpdatePlan {
	readonly intents: readonly ContactUpdateIntent[];
	readonly changes: Partial<Contact>;
}

/**
 * Which of the two commands an edit is, from what actually changed.
 *
 * Pure and exported for its tests: naming an intent the change set has nothing
 * for is refused by the domain, and naming one too few saves half the form
 * behind a 200. Neither is visible from the call site.
 *
 * `null` when nothing moved — an untouched save is not a write.
 */
export function contactUpdatePlan(
	fields: ContactFields,
	current: ContactFields,
): ContactUpdatePlan | null {
	const intents: ContactUpdateIntent[] = [];
	const changes: Partial<Contact> = {};

	if (
		fields.contactName !== current.contactName ||
		fields.company !== current.company ||
		fields.department !== current.department ||
		fields.title !== current.title
	) {
		intents.push('publicEngagement.updateContactDetails');
		changes.contact_name = fields.contactName;
		changes.company = fields.company;
		changes.department = fields.department;
		changes.title = fields.title;
	}

	if (
		fields.preferredPhone !== current.preferredPhone ||
		fields.alternatePhone !== current.alternatePhone ||
		fields.email !== current.email ||
		fields.wantsEmail !== current.wantsEmail ||
		fields.wantsSms !== current.wantsSms ||
		fields.wantsPhone !== current.wantsPhone
	) {
		intents.push('publicEngagement.updateContactCommunication');
		changes.preferred_phone = fields.preferredPhone;
		changes.alternate_phone = fields.alternatePhone;
		changes.email = fields.email;
		changes.wants_email = fields.wantsEmail;
		changes.wants_sms = fields.wantsSms;
		changes.wants_phone = fields.wantsPhone;
	}

	return intents.length === 0 ? null : { intents, changes };
}

export interface ContactMutations {
	/**
	 * Add a contact.
	 *
	 * Takes the id rather than minting one, because the service-request form
	 * writes the contact and the request in the same submit and has to name the
	 * new contact in the request that follows it.
	 */
	readonly create: (contactId: string, fields: ContactFields) => Promise<void>;
	readonly save: (
		contactId: string,
		fields: ContactFields,
		current: ContactFields,
	) => Promise<void>;
	readonly remove: (contactId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useContactMutations(): ContactMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (contactId: string, fields: ContactFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(contacts, {
					operation: 'insert',
					intent: 'publicEngagement.createContact',
					row: {
						id: contactId,
						organization_id: organizationId,
						contact_name: fields.contactName,
						company: fields.company,
						department: fields.department,
						title: fields.title,
						preferred_phone: fields.preferredPhone,
						alternate_phone: fields.alternatePhone,
						email: fields.email,
						wants_email: fields.wantsEmail,
						wants_sms: fields.wantsSms,
						wants_phone: fields.wantsPhone,
						metadata: null,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies Contact,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (contactId: string, fields: ContactFields, current: ContactFields) => {
			const plan = contactUpdatePlan(fields, current);
			if (plan === null) {
				return;
			}

			await settleWrite(
				mutateCollection(contacts, {
					operation: 'update',
					intent: plan.intents,
					key: contactId,
					changes: {
						...plan.changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (contactId: string) => {
		await settleWrite(
			mutateCollection(contacts, {
				operation: 'delete',
				intent: 'publicEngagement.deleteContact',
				key: contactId,
			}),
		);
	}, []);

	return {
		create,
		save,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
