import { useState } from 'react';
import { newRecordId } from '../mutations/shared';

/** The id a not-yet-saved inspection will be written under, minted once. */
export function useNewInspectionDraft(): string {
	const [inspectionId] = useState(() => newRecordId());
	return inspectionId;
}
