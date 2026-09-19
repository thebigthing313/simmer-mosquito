import { eq, useLiveQuery } from '@tanstack/react-db';
import { useState } from 'react';
import { samples } from '../../lib/collections/samples';
import { newRecordId } from '../mutations/shared';
import { activityGcTimeMs } from '../queries/shared';
import { useAdditionalPersonnel } from '../queries/use-additional-personnel';

/**
 * The id a not-yet-saved inspection will be written under, minted once, with
 * its samples and crew streams already subscribed.
 */
export function useNewInspectionDraft(): string {
	const [inspectionId] = useState(() => newRecordId());
	useAdditionalPersonnel({ type: 'inspection', id: inspectionId });
	useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ sample: samples() })
				.where(({ sample }) => eq(sample.inspection_id, inspectionId)),
	});
	return inspectionId;
}
