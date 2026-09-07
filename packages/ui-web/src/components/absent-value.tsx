/**
 * The em dash a record shows where it carries no value.
 *
 * The glyph is a deliberate UI symbol rather than prose, which is why
 * `docs/writing-style.md` does not reach it. That rule is about sentences an
 * agent writes: a standalone dash in a column is a mark chosen to mean "nothing
 * here", and it reads as that instantly and in every row. Spelling the absence
 * out instead put a sentence in a cell whose job was one word, and the columns
 * that tried it had collected "No method recorded", "No description" and "Not
 * recorded" for the one idea.
 *
 * `role="img"` with `aria-label` is what names it for assistive technology, so
 * nothing announces the character. Four of the five other `role="img"` elements
 * in the workspace name themselves that way; the copy this replaced used
 * `title`, which paints a hover tooltip and is a weak source for an accessible
 * name. The label is "Not recorded", the same words {@link DetailRow} shows, so
 * one absence has one phrasing across both apps.
 *
 * This is for a column and a list, where there is room for a mark and not for
 * words. A row with room for words is a {@link DetailRow}, and an absence that
 * means something more specific than "nothing" is that row's `empty` prop:
 * "Unassigned", "None", "Pending", "Unfiled".
 */
export function AbsentValue() {
	return (
		<span aria-label="Not recorded" className="text-muted-foreground" role="img">
			—
		</span>
	);
}
