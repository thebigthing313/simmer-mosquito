/**
 * What an Outreach Action looks like above the query layer.
 *
 * Not a hook, so not a `use-` file.
 *
 * Outreach lives under public engagement but is written with `controlOperations.*`
 * commands, which is why its shape reads like a control action: a method, a date,
 * a place, an amount. The amount is `reach` — people, never a volume — and it has
 * no unit column for that reason.
 */

import type { LinkedAddress } from './address-view';

/** An Outreach Action, as the surfaces that show one whole want it. */
export interface OutreachAction {
	readonly id: string;
	/** `YYYY-MM-DD`. A `date` column, so a string — never a `Date`. */
	readonly outreachDate: string;
	readonly methodId: string;
	/** Never null — outreach must name a method. `Unknown method` while streaming. */
	readonly methodName: string;
	readonly technicianProfileId: string | null;
	readonly technicianName: string | null;
	/** How many people it reached. Format with `formatReach`. */
	readonly reach: number;
	readonly reachDescription: string | null;

	readonly addressId: string | null;
	/** Joined, not looked up — see `address-view.ts` for why it is nested here. */
	readonly address: LinkedAddress;
	readonly inspectionId: string | null;
	readonly requestedControlActionId: string | null;
	readonly missionItemId: string | null;

	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	readonly metadata: unknown;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
}
