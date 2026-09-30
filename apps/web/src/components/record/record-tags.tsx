import type { TagTarget, TagTargetType } from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { toast } from 'sonner';
import { useRecordTagMutations } from '../../hooks/mutations/use-record-tag-mutations';
import type { AssignedTag } from '../../hooks/queries/tag-view';
import { useRecordTags } from '../../hooks/queries/use-record-tags';
import { errorMessageForSave } from '../../lib/save-error';
import { TagBadge } from '../tag-badge';
import { WriteOnly } from '../write-only';
import { TagPickerDialog } from './tag-picker-dialog';

/**
 * The record's Tags, as chips at the right end of the detail header.
 *
 * One component for all six taggable record types, drawn by `DetailPageHeader`
 * for every one of them. The chips draw for every role; the picker that changes
 * them is {@link RecordTagPicker}, opened from the header's `...`.
 *
 * A sibling query rather than something the page passes down: it is keyed on the
 * record id the header already has, and `tag_items.entity_id` is globally
 * unique, so the read needs no entity type.
 *
 * The `x` on a chip is `WriteOnly`, since taking a Tag off is collector and
 * above. It appears on hover, and the picker does the same job without a
 * pointer, so nothing is reachable by hover alone.
 */
export function RecordTags({ recordId }: { readonly recordId: string }) {
	const tags = useRecordTags(recordId);
	return (
		<>
			{tags.map((tag) => (
				<AssignedTagChip key={tag.id} tag={tag} />
			))}
		</>
	);
}

/**
 * The tag picker over one record, with the Tags it holds now.
 *
 * The header mounts this beside its menu rather than inside it, because a
 * dialog inside a menu item is unmounted by the click that opens it. It reads
 * the record's Tags itself so the header needs no second copy of them, and it
 * mounts the dialog only while it is open, so a closed picker holds no catalog
 * query and a reopened one starts with an empty search.
 *
 * The record type is what the *write* needs: `assignTag` names both columns.
 */
export function RecordTagPicker({
	onOpenChange,
	open,
	recordId,
	recordType,
}: {
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
	readonly recordId: string;
	readonly recordType: TagTargetType;
}) {
	const tags = useRecordTags(recordId);
	if (!open) {
		return null;
	}
	const target: TagTarget = { type: recordType, id: recordId };
	return (
		<TagPickerDialog assigned={tags} onOpenChange={onOpenChange} open={open} target={target} />
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
					className="opacity-0 [@media(hover:none)]:opacity-100 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
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
