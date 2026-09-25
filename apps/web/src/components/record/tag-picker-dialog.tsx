import type { TagTarget } from '@simmer-mosquito/domain';
import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { useRecordTagMutations } from '../../hooks/mutations/use-record-tag-mutations';
import type { AssignedTag } from '../../hooks/queries/tag-view';
import { useTagPickerCatalog } from '../../hooks/queries/use-tag-picker-catalog';
import { recordNoun } from '../../lib/record-nouns';
import { errorMessageForSave } from '../../lib/save-error';
import { type PickerTag, tagPickerSections } from '../../lib/tag-relevance';
import { TagBadge } from '../tag-badge';

/**
 * The whole Tag catalog, over the record it is being put on.
 *
 * A modal rather than a popover checklist, and no control that widens the list:
 * both sections are on screen from the start, so relevance orders the catalog
 * rather than filtering it, and an assigned Tag is never out of view. What each
 * section holds is `docs/tag-relevance-spec.md`.
 *
 * It closes rather than saves. A checkbox writes on the click, so there is no
 * draft to keep and `Done` is a way out rather than a commit; the header chip's
 * `x` is the same call, which is what a batched save would have had to undo.
 *
 * A failed write throws, TanStack DB rolls the optimistic row back, and the
 * toast is what says why: a tick that silently un-ticks itself reads as a broken
 * checkbox.
 */
export function TagPickerDialog({
	assigned,
	onOpenChange,
	open,
	target,
}: {
	readonly assigned: readonly AssignedTag[];
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
	/** Which record, and which kind of record. The kind is the register's key. */
	readonly target: TagTarget;
}) {
	const catalog = useTagPickerCatalog();
	const mutations = useRecordTagMutations();
	const [search, setSearch] = useState('');

	const assignedByTagId = new Map(assigned.map((tag) => [tag.id, tag]));
	// One source for the record type. The record it is being put on and the kind
	// of record the sections are about are the same fact, and two props carrying
	// it are two props that can disagree.
	const noun = recordNoun(target.type);

	// Which Tag draws where is `tagPickerSections`, which is pure and tested: an
	// inactive Tag is listed only where it is assigned and always in the second
	// section, an empty relevance set counts as relevant, and a search matches a
	// substring of the name or the description.
	const { relevant, rest } = tagPickerSections(
		catalog,
		new Set(assignedByTagId.keys()),
		target.type,
		search,
	);

	const write = async (tag: PickerTag) => {
		const already = assignedByTagId.get(tag.id);
		try {
			if (already === undefined) {
				await mutations.assign(target, tag.id);
			} else {
				await mutations.unassign(already.tagItemId);
			}
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	};

	// The row hands back nothing, so the write is started and the toast is what
	// reports a failure. TanStack DB has already rolled the tick back by then.
	const toggle = (tag: PickerTag) => void write(tag);

	const searching = search.trim().length > 0;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[80vh] gap-3 overflow-hidden">
				<DialogHeader>
					<DialogTitle>Tags</DialogTitle>
					{/* The two headings below say which tags come first, so a line here
					    saying it again is the app explaining itself. `sr-only` rather than
					    absent because the dialog is described by it. */}
					<DialogDescription className="sr-only">The tags on this {noun.one}.</DialogDescription>
				</DialogHeader>
				<Input
					aria-label="Search tags"
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search tags"
					value={search}
				/>
				<div className="grid gap-4 overflow-y-auto">
					{searching && relevant.length === 0 && rest.length === 0 ? (
						<p className="m-0 text-muted-foreground text-sm">No tags match your search.</p>
					) : null}
					{/* Both sections stand while the box is empty, each over a line of its
					    own when it holds nothing: the empty `For habitats` is what says the
					    catalog has nothing set up for this record type, and the Tags table
					    under My organization is where that is fixed. A search is the one
					    thing that drops a section, because the line under an empty one
					    would be answering a question nobody asked. */}
					{searching && relevant.length === 0 ? null : (
						<TagPickerSection
							assignedTagIds={new Set(assignedByTagId.keys())}
							emptyLine={`No tags are suggested for ${noun.many} yet. Set one up under My organization.`}
							heading={`For ${noun.many}`}
							onToggle={toggle}
							tags={relevant}
						/>
					)}
					{searching && rest.length === 0 ? null : (
						<TagPickerSection
							assignedTagIds={new Set(assignedByTagId.keys())}
							emptyLine={`Every active tag is suggested for ${noun.many}.`}
							heading="Every other tag"
							onToggle={toggle}
							tags={rest}
						/>
					)}
				</div>
				<DialogFooter className="items-center sm:justify-between">
					<span className="text-muted-foreground text-sm">
						{assigned.length} on this {noun.one}
					</span>
					<Button onClick={() => onOpenChange(false)} type="button" variant="outline">
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function TagPickerSection({
	assignedTagIds,
	emptyLine,
	heading,
	onToggle,
	tags,
}: {
	readonly assignedTagIds: ReadonlySet<string>;
	/** What stands under the heading when the section holds nothing. */
	readonly emptyLine: string;
	readonly heading: string;
	readonly onToggle: (tag: PickerTag) => void;
	readonly tags: readonly PickerTag[];
}) {
	return (
		<section className="grid gap-1.5">
			<h3 className={eyebrow({ tone: 'primary' })}>{heading}</h3>
			{tags.length === 0 ? (
				<p className="m-0 text-muted-foreground text-sm">{emptyLine}</p>
			) : (
				tags.map((tag) => (
					<TagPickerRow
						assigned={assignedTagIds.has(tag.id)}
						key={tag.id}
						onToggle={() => onToggle(tag)}
						tag={tag}
					/>
				))
			)}
		</section>
	);
}

function TagPickerRow({
	assigned,
	onToggle,
	tag,
}: {
	readonly assigned: boolean;
	readonly onToggle: () => void;
	readonly tag: PickerTag;
}) {
	// `Label` over a wrapping `<label>`: the primitive is a Radix button rather
	// than an input, so only `htmlFor` makes the text a second target for it.
	const checkboxId = useId();

	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/40">
			<Checkbox checked={assigned} className="mt-0.5" id={checkboxId} onCheckedChange={onToggle} />
			<Label className="grid cursor-pointer gap-0.5 font-normal" htmlFor={checkboxId}>
				<span className="flex flex-wrap items-center gap-1.5">
					<TagBadge tag={tag} />
					{tag.isActive ? null : (
						<Badge className="text-muted-foreground" variant="outline">
							Deactivated
						</Badge>
					)}
				</span>
				{tag.description === null ? null : (
					<span className="text-muted-foreground text-sm">{tag.description}</span>
				)}
			</Label>
		</div>
	);
}
