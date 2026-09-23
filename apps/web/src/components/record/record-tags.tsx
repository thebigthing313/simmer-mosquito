import type { TagTarget, TagTargetType } from '@simmer-mosquito/domain';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { TagIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRecordTagMutations } from '../../hooks/mutations/use-record-tag-mutations';
import type { AssignedTag } from '../../hooks/queries/tag-view';
import { useRecordTags } from '../../hooks/queries/use-record-tags';
import { errorMessageForSave } from '../../lib/save-error';
import { TagBadge } from '../tag-badge';
import { WriteOnly } from '../write-only';
import { TagPickerDialog } from './tag-picker-dialog';

/**
 * The record's Tags, and the control that changes them.
 *
 * One component for all six taggable record types. `DetailPageHeader` draws the
 * row for address, region, trap and contact, and `habitat-detail.tsx` and
 * `service-request-detail-header.tsx` reach it through the same header, so a Tag
 * is put on a record the same way whichever page you are on.
 *
 * A sibling query rather than something the page passes down: it is keyed on the
 * record id the header already has, and `tag_items.entity_id` is globally
 * unique, so the read needs no entity type. The *write* does, which is what the
 * record type is for here.
 *
 * A record with no Tags draws the button with no count rather than nothing. The
 * row used to be hidden when it was empty, which is the right answer for a row
 * of chips and the wrong one for a row holding the only way to add one.
 *
 * Every control is `WriteOnly`: assigning is collector-and-above, so a viewer
 * sees the chips and no button and no `x`. The `x` appears on hover and the
 * dialog does the same job without a pointer, so nothing is reachable by hover
 * alone.
 */
export function RecordTags({
	recordId,
	recordType,
}: {
	readonly recordId: string;
	readonly recordType: TagTargetType;
}) {
	const tags = useRecordTags(recordId);
	const [open, setOpen] = useState(false);
	const target: TagTarget = { type: recordType, id: recordId };

	return (
		<>
			{tags.map((tag) => (
				<AssignedTagChip key={tag.id} tag={tag} />
			))}
			<WriteOnly>
				<Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
					<TagIcon aria-hidden="true" />
					Tags
					{tags.length === 0 ? null : <Badge variant="secondary">{tags.length}</Badge>}
				</Button>
				{open ? (
					<TagPickerDialog assigned={tags} onOpenChange={setOpen} open={open} target={target} />
				) : null}
			</WriteOnly>
		</>
	);
}

/** One chip, with the shortcut for the common case: this tag coming off. */
function AssignedTagChip({ tag }: { readonly tag: AssignedTag }) {
	const mutations = useRecordTagMutations();

	const unassign = async () => {
		try {
			await mutations.unassign(tag.tagItemId);
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	};

	return (
		<span className="group inline-flex items-center gap-0.5">
			<TagBadge tag={tag} />
			<WriteOnly>
				<Button
					className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
					onClick={() => void unassign()}
					size="icon"
					type="button"
					variant="ghost"
				>
					<XIcon aria-hidden="true" />
					<span className="sr-only">Remove {tag.name}</span>
				</Button>
			</WriteOnly>
		</span>
	);
}
