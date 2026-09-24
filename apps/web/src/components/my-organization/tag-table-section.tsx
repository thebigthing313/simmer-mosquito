import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import type { TagRecord } from '../../hooks/queries/use-tag-catalog';
import { TagDisplayTableRow } from './tag-display-table-row';
import { TagEditorTableRow } from './tag-editor-table-row';

export function TagTableSection({
	canManage,
	editingTagId,
	emptyLabel,
	onCancelEdit,
	onEdit,
	tags,
	title,
}: {
	readonly canManage: boolean;
	readonly editingTagId: string | null;
	readonly emptyLabel: string;
	readonly onCancelEdit: () => void;
	readonly onEdit: (tagId: string) => void;
	readonly tags: readonly TagRecord[];
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<h3 className={eyebrow({ tone: 'primary', className: 'mt-0.5' })}>{title}</h3>
			{tags.length === 0 ? (
				<p className="m-0 rounded-md border border-border/30 bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 [--tag-actions-column:156px] [--tag-color-column:150px] [--tag-description-column:clamp(220px,30vw,360px)] [--tag-preview-column:clamp(150px,18vw,220px)] [--tag-relevance-column:clamp(160px,20vw,240px)]">
					{/* Full width, so the table lines up with the cards above it, and the
					    Description column is the one left without a width: `table-fixed`
					    hands the slack to it rather than spreading it over every column,
					    which is how the four spread across 1616px before #1054. The column
					    widths summed are the floor, where the table starts to scroll. */}
					<Table className="w-full min-w-[calc(var(--tag-preview-column)+var(--tag-description-column)+var(--tag-relevance-column)+var(--tag-color-column)+var(--tag-actions-column))] table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-(--tag-preview-column)">Tag Preview</TableHead>
								<TableHead>Description</TableHead>
								{/* `Suggested For` and not `Applies To`: nothing is enforced, and
								    any active Tag still goes on any taggable record. */}
								<TableHead className="w-(--tag-relevance-column)">Suggested For</TableHead>
								<TableHead className="w-(--tag-color-column)">Color</TableHead>
								{canManage ? (
									<TableHead className="w-(--tag-actions-column) text-right">Actions</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{tags.map((tag) =>
								editingTagId === tag.id ? (
									<TagEditorTableRow key={tag.id} tag={tag} onCancel={onCancelEdit} />
								) : (
									<TagDisplayTableRow
										canManage={canManage}
										key={tag.id}
										onEdit={() => onEdit(tag.id)}
										tag={tag}
									/>
								),
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
