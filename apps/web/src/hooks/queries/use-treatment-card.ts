/**
 * One Treatment with what its map card draws: the visit's method, applicator
 * and address joined, and its products through the one correlated line
 * include. Takes the Treatment id, or `null` for none.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { application_methods } from '../../lib/collections/application_methods';
import { profiles } from '../../lib/collections/profiles';
import { treatments } from '../../lib/collections/treatments';
import type { LinkedAddress } from './address-view';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import { addressSelect, joinedOrNull, liveQueryGcTimeMs, unmatchableId } from './shared';
import { linesOf, type TreatmentLine, treatmentLines } from './treatment-lines';

const treatmentReads = PERFORMED_ACTIONS.treatments;

/** What the card reads off one Treatment. */
export interface TreatmentCardView {
	readonly id: string;
	readonly actionDate: string;
	readonly methodId: string | null;
	/** `null` while the method is not in the client. */
	readonly methodName: string | null;
	readonly applicatorProfileId: string | null;
	/** `null` while the applicator's Profile is not in the client. */
	readonly applicatorName: string | null;
	readonly addressId: string | null;
	readonly address: LinkedAddress;
	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	/** The products, oldest first. */
	readonly lines: readonly TreatmentLine[];
}

export function useTreatmentCard(treatmentId: string | null): {
	readonly treatment: TreatmentCardView | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ treatment: treatments() })
				.where(({ treatment }) => eq(treatment.id, treatmentId ?? unmatchableId))
				// `left` throughout: a Treatment need not name a method or an
				// applicator, and most name no address.
				.join(
					{ method: application_methods() },
					({ treatment, method }) => treatmentReads.joinMethod(treatment, method),
					'left',
				)
				.join(
					{ applicator: profiles() },
					({ treatment, applicator }) => treatmentReads.joinPerformer(treatment, applicator),
					'left',
				)
				.join(
					{ address: addresses() },
					({ treatment, address }) => eq(treatment.address_id, address.id),
					'left',
				)
				.select(({ treatment, method, applicator, address }) => {
					const measured = treatmentReads.measured(treatment);
					return {
						id: treatment.id,
						actionDate: treatmentReads.date(treatment),
						methodId: measured.methodId,
						methodName: joinedOrNull(method.name),
						applicatorProfileId: measured.performerProfileId,
						applicatorName: joinedOrNull(applicator.display_name),
						addressId: treatment.address_id,
						address: addressSelect(address),
						latitude: treatment.lat,
						longitude: treatment.lng,
						geometryKind: treatment.geom_type,
						lines: treatmentLines(query, treatment),
					};
				}),
	});

	const row = result.data[0];
	return {
		treatment:
			row === undefined ? undefined : ({ ...row, lines: linesOf(row.lines) } as TreatmentCardView),
		isReady: result.isReady,
		isError: result.isError,
	};
}
