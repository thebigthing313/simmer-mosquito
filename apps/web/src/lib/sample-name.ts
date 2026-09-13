/**
 * How a sample names itself.
 *
 * `display_name` is the crew's own label for a vial and is optional, so a sample
 * with none is named by the head of its id. Four surfaces render this label, the
 * habitat detail history, the inspection detail, the sample detail and the
 * samples explorer, and each reads a row type of its own, so the parameter is
 * the structural minimum those four share rather than any one of them.
 */
export function sampleName(sample: {
	readonly id: string;
	readonly displayName: string | null | undefined;
}): string {
	return sample.displayName?.trim() || `Sample ${sample.id.slice(0, 8)}`;
}
