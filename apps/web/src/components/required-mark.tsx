/**
 * The `*` that marks a required field.
 *
 * Required is marked; optional is not. The inverse — annotating every optional
 * field — put the longest annotation on the least important fields, and these
 * forms are mostly optional, so the page filled with "(optional)" and the
 * handful of required fields were the ones that disappeared.
 *
 * Hidden from assistive tech: controls carry `aria-required` instead, which
 * announces the same thing without reading a punctuation mark aloud.
 */
export function RequiredMark() {
	return (
		<span aria-hidden="true" className="text-[var(--danger)]">
			*
		</span>
	);
}
