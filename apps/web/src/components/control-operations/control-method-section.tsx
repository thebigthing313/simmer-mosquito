import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { useState } from 'react';
import type { ControlMethodRecord } from '../../hooks/queries/catalog-record-view';
import { useAcknowledgedWrite } from '../../hooks/use-acknowledged-write';
import {
	CatalogActionsHead,
	CatalogNameCell,
	CatalogRowActions,
	CatalogSection,
	toggleCatalogActive,
} from '../catalog';
import { CustomFieldsCell } from '../custom-fields-cell';
import { ControlMethodDialog, type MethodDialogContext } from './control-method-dialog';

export function ControlMethodSection({
	canEditMethods,
	canManage,
	emptyLabel,
	rows,
	title,
	tone,
	...dialogContext
}: MethodDialogContext & {
	readonly canEditMethods: boolean;
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly rows: readonly ControlMethodRecord[];
	readonly title: string;
	readonly tone: 'active' | 'inactive';
}) {
	return (
		<CatalogSection
			columns={
				<TableRow className="bg-muted/40 hover:bg-muted/40">
					<TableHead>Method</TableHead>
					<TableHead className="w-[22%]">Custom Fields</TableHead>
					{canEditMethods ? <CatalogActionsHead /> : null}
				</TableRow>
			}
			count={rows.length}
			emptyLabel={emptyLabel}
			title={title}
		>
			{rows.map((method) => (
				<TableRow key={method.id}>
					<CatalogNameCell isInactive={tone === 'inactive'} name={method.name} />
					<TableCell className="align-top">
						<CustomFieldsCell schema={method.customSchema} />
					</TableCell>
					{canEditMethods ? (
						<TableCell className="align-top text-right">
							<ControlMethodRowActions {...dialogContext} canManage={canManage} method={method} />
						</TableCell>
					) : null}
				</TableRow>
			))}
		</CatalogSection>
	);
}

function ControlMethodRowActions({
	canManage,
	method,
	...dialogContext
}: MethodDialogContext & { readonly canManage: boolean; readonly method: ControlMethodRecord }) {
	const [editOpen, setEditOpen] = useState(false);
	const { mutations } = dialogContext;
	// The retire here issues `deactivate` on its own, so it carries the catalog's
	// own questions rather than the dialog's.
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });

	return (
		<>
			{/*
			 * Deactivate and reactivate are `ADMIN`; the Edit above them is `MANAGER`.
			 * A manager sees the menu with only Edit in it.
			 *
			 * The toggle is never pre-emptively disabled here, unlike collection
			 * methods: control actions sync on demand, so a local "still in use"
			 * count would undercount. The server rejects a deactivation it disallows
			 * and that error is what surfaces.
			 */}
			<CatalogRowActions
				isActive={method.isActive}
				name={method.name}
				onEdit={() => setEditOpen(true)}
				onToggle={
					canManage
						? () =>
								toggleCatalogActive({
									apply: (isActive) =>
										run((acknowledgements) =>
											mutations.setActive(method.id, isActive, acknowledgements),
										),
									isActive: method.isActive,
									name: method.name,
								})
						: undefined
				}
			/>
			<ControlMethodDialog
				{...dialogContext}
				method={method}
				onOpenChange={setEditOpen}
				open={editOpen}
			/>
			{dialog}
		</>
	);
}
