import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { TableCell, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import type { TagRecord } from '../../hooks/queries/use-tag-catalog';
import { hexWithAlpha, validHexColor } from '../../lib/hex-color';
import { EditIcon } from './constants';

export function TagDisplayTableRow({
	canManage,
	onEdit,
	tag,
}: {
	readonly canManage: boolean;
	readonly onEdit: () => void;
	readonly tag: TagRecord;
}) {
	return (
		<TableRow>
			<TableCell className="w-(--tag-preview-column)">
				<TagBadge tag={tag} />
			</TableCell>
			<TableCell className="w-(--tag-description-column) whitespace-normal text-muted-foreground wrap-anywhere">
				{tag.description ?? <AbsentValue />}
			</TableCell>
			<TableCell className="w-(--tag-color-column)">
				<TagColorSwatch color={tag.color} />
			</TableCell>
			{canManage ? (
				<TableCell className="w-(--tag-actions-column) text-right">
					<Button type="button" variant="outline" size="sm" onClick={onEdit}>
						<EditIcon aria-hidden="true" />
						Edit
					</Button>
				</TableCell>
			) : null}
		</TableRow>
	);
}

function TagBadge({ tag }: { readonly tag: TagRecord }) {
	const color = validHexColor(tag.color);
	const style =
		color === null
			? undefined
			: ({
					'--tag-color': color,
					'--tag-bg': hexWithAlpha(color, 0.14),
					'--tag-border': hexWithAlpha(color, 0.36),
				} as React.CSSProperties);

	return (
		<Badge
			variant={color === null ? 'secondary' : 'outline'}
			className={
				color === null ? undefined : 'border-(--tag-border) bg-(--tag-bg) text-(--tag-color)'
			}
			style={style}
			title={tag.description ?? undefined}
		>
			{tag.name}
		</Badge>
	);
}

function TagColorSwatch({ color }: { readonly color: string | null }) {
	const normalized = validHexColor(color);
	const style =
		normalized === null ? undefined : ({ '--tag-color': normalized } as React.CSSProperties);

	return (
		<span className="inline-flex items-center gap-2">
			<span
				aria-hidden="true"
				className={
					normalized === null
						? 'size-3 rounded-sm border border-border bg-muted'
						: 'size-3 rounded-sm border border-border bg-(--tag-color)'
				}
				style={style}
			/>
			<span className="font-mono text-xs text-muted-foreground">{normalized ?? 'Default'}</span>
		</span>
	);
}
