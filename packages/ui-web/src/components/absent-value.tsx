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
 * name. The label is "Not recorded", so the mark is silent on screen and says
 * the words aloud.
 *
 * A column, a list and a {@link DetailRow} all draw this. The row used to spell
 * its absence out instead, and each card picked its own wording: "Unassigned",
 * "None", "Pending", "Unfiled", "Unknown", "No method named", "Ad-hoc, no
 * trap". Twenty-two rows, thirteen spellings, and a reader scanning a card for
 * what is missing had to read each one to find out that the answer was nothing.
 * One mark is scannable down a column of labels in a way thirteen sentences are
 * not, so the row draws the mark now and the `empty` prop is gone.
 */
export function AbsentValue() {
	return (
		<span aria-label="Not recorded" className="text-muted-foreground" role="img">
			—
		</span>
	);
}
