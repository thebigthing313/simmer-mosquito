/**
 * What a Service Request looks like above the query layer.
 *
 * Not a hook, so not a `use-` file.
 *
 * ## Two clocks again, for a different reason
 *
 * `requestDate` is a `date` column — the day the public reported it, a calendar
 * fact with no time in it, so a `YYYY-MM-DD` string. `closedAt` is a
 * `timestamptz` written by the browser at the moment somebody closed it, so a
 * `Date`. They are not comparable and nothing should try: a request opened and
 * closed the same day has a `requestDate` and a `closedAt` that disagree about
 * what time it is, because only one of them claims to know.
 *
 * `closedAt` is also not the same clock as `updatedAt`, which Postgres writes.
 * Any check of the form "was that write the close?" needs a tolerance — see the
 * note on `apps/server` for why (#125).
 */

import type { RequestIntakeType } from '@simmer-mosquito/domain';

export type { RequestIntakeType };

import type { LinkedAddress } from './address-view';
import type { LinkedContact } from './contact-view';

/** A Service Request, as the surfaces that show one whole want it. */
export interface ServiceRequest {
	readonly id: string;
	/**
	 * The sequential number the server assigns after the write commits, which is
	 * what titles a request as `#123`. `null` on a row that has not synced yet —
	 * `serviceRequestTitle` falls back to a short id for exactly that window.
	 */
	readonly displayName: number | null;
	readonly intakeType: RequestIntakeType;
	/** `YYYY-MM-DD`. The day it was reported. See the module comment. */
	readonly requestDate: string;
	readonly details: string;

	readonly contactId: string;
	/** Joined, not looked up. Read it with `resolveLinkedContact`. */
	readonly contact: LinkedContact;

	readonly addressId: string;
	/** Joined, not looked up — see `address-view.ts` for why it is nested here. */
	readonly address: LinkedAddress;

	readonly receivedByProfileId: string | null;
	/** The instant somebody closed it, or `null` while it is open. */
	readonly closedAt: Date | null;
	readonly closedByProfileId: string | null;

	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	readonly metadata: unknown;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
}
