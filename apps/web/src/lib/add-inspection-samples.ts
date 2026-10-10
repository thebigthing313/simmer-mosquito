import type { SampleMutations } from '../hooks/mutations/use-sample-mutations';

/**
 * Add samples to an inspection, new or existing, one write after another in the
 * order the form lists them. A blank label adds an unlabeled sample.
 */
export async function addSamplesInFormOrder(
	add: SampleMutations['add'],
	inspectionId: string,
	samples: readonly { readonly id: string; readonly label: string }[],
): Promise<void> {
	// One at a time, in form order, because the samples grid sorts on `created_at`.
	for (const sample of samples) {
		const label = sample.label.trim();
		await add({ sampleId: sample.id, inspectionId, displayName: label === '' ? null : label });
	}
}
