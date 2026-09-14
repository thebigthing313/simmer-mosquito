import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

/**
 * The label-and-value rows a record's detail card is made of.
 *
 * `DetailRow` had been copy-pasted into sixteen route files, and the copies had
 * drifted apart on the one thing that has to agree: the label column was
 * `90px` in eight of them, `92px` in two, `100px` in three, `110px`, `120px`
 * and `8.5rem` in one each. Eight widths for one row means two cards on the
 * same page start their values at different places.
 *
 * The width here is `7.5rem`, the widest the copies had converged on. It clears
 * the longest label in the workspace ("Email verified", on the account page,
 * which is why that copy had grown to `8.5rem`), and it is the column
 * `CustomFieldsList` already uses, so the habitat page's two fact lists line up
 * instead of sitting eight pixels apart. Nothing needs more.
 *
 * ## One empty marker
 *
 * The copies also disagreed on what an absent value reads as. Five rows on the
 * address page said "—", three on the account page said "—" through a helper
 * called `orNotSet`, six on the contact page said "Not set" through a different
 * helper with the same name, and four more said "—" through the component that
 * is now {@link AbsentValue}. Same absence, four spellings, two of them from
 * functions named the same thing.
 *
 * A row with no value draws {@link AbsentValue}, the same mark a column and a
 * list draw. It had its own words for a while, and an `empty` prop on top of
 * them for a row whose absence meant something more particular: "Unassigned",
 * "None", "Pending", "Unfiled", "Unknown", "No method named", "Standalone, no
 * habitat". Twenty-two rows had picked thirteen spellings of nothing, several
 * of them on one card, and the reason the prop was worth its cost never
 * survived contact with a card: a reader scanning a column of labels for what
 * is missing reads one mark at a glance and has to read thirteen sentences one
 * at a time. Where a row genuinely has more to say than "nothing", it says it
 * as an ordinary value rather than as a variant of the absence.
 *
 * `CustomFieldsList` in `apps/web` is the one list that keeps its own row and
 * still belongs in a {@link DetailList}. Its labels are written by the
 * organization rather than by us, so they wrap instead of truncating, and a
 * retired field carries a badge inside the label. Same column, different `dt`.
 */
export function DetailRow({
	label,
	children,
}: {
	readonly label: string;
	readonly children?: ReactNode;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">
				{isAbsent(children) ? <AbsentValue /> : children}
			</dd>
		</div>
	);
}

/**
 * The `<dl>` a run of {@link DetailRow}s sits in.
 *
 * Fourteen of the sixteen copies wrote `grid gap-2.5` on their own `<dl>`, so
 * the rhythm between rows is settled here too. `className` is for what a
 * particular card adds around that, such as the rule the service request page
 * draws above its second group.
 *
 * ## The list carries its own measure
 *
 * A fact row is a 7.5rem label beside a short value, so it is the one thing on
 * a record page that a wider page makes worse rather than better. Measured on
 * the contact page at 1920: the value column ran 600px around 81px of ink, and
 * the eye had to travel the whole way back to the next label. That is the
 * reason the detail frame could not simply be widened, and it is why the cap
 * lives here rather than on the page: the card is what knows it holds facts.
 *
 * 34rem is the label, the gap and about 22rem of value, which clears the
 * longest values in the workspace (a full street address, a product name, a
 * pair of coordinates) with room to spare. A card whose values genuinely need
 * more passes `max-w-*` in `className`; `cn` lets the caller's width win.
 */
export function DetailList({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}) {
	return <dl className={cn('m-0 grid max-w-[34rem] gap-2.5', className)}>{children}</dl>;
}

/**
 * Whether a row was handed nothing.
 *
 * `null` and `undefined` are what a missing column arrives as. `false` is what
 * `{flag && <Value />}` leaves behind. A blank or whitespace-only string is a
 * column the record has but never filled, which reads on screen as a row with
 * no value and should say the same thing as a null one.
 */
function isAbsent(children: ReactNode): boolean {
	if (children === null || children === undefined || children === false) {
		return true;
	}
	return typeof children === 'string' && children.trim() === '';
}
