import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import type React from 'react';
import { displayFieldValue } from '../helpers';
import type { SettingField, SetupCatalog } from '../types';
import { EditSettingsSheet } from './edit-settings-sheet';
import { OrgSection } from './org-section';
import { OrgSurface } from './org-surface';
import { SectionHeader } from './section-header';

export function DomainSection({
	canManage,
	children,
	editDescription,
	editAction,
	fields,
	id,
	meta,
	onSave,
	setupItems,
	title,
}: {
	readonly canManage: boolean;
	readonly children?: React.ReactNode;
	readonly editDescription: string;
	readonly editAction?: React.ReactNode;
	readonly fields: readonly SettingField[];
	readonly id: string;
	readonly meta: string;
	readonly onSave?: ((formData: FormData) => unknown) | undefined;
	readonly setupItems: readonly SetupCatalog[];
	readonly title: string;
}) {
	const action =
		canManage && editAction !== undefined ? (
			editAction
		) : canManage && fields.length > 0 ? (
			<EditSettingsSheet
				description={editDescription}
				fields={fields}
				onSave={onSave}
				title={`Edit ${title}`}
			/>
		) : null;

	return (
		<OrgSection id={id}>
			<OrgSurface>
				<SectionHeader action={action} meta={meta} title={title} />
				{children ?? (fields.length === 0 ? null : <SettingsDisplayGrid fields={fields} />)}
				<SetupList items={setupItems} />
			</OrgSurface>
		</OrgSection>
	);
}

function SetupList({ items }: { readonly items: readonly SetupCatalog[] }) {
	if (items.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1.5">
			<h3 className="eyebrow mt-0.5 mb-0">Setup Lists</h3>
			<div className="grid gap-2">
				{items.map((catalog) => (
					<article
						className="grid min-w-0 items-center gap-3 rounded-md border border-border/30 bg-muted/40 p-2.5 md:grid-cols-[minmax(240px,1fr)_auto]"
						key={catalog.label}
					>
						<div className="min-w-0">
							<span className="font-medium wrap-anywhere text-sm text-foreground">
								{catalog.label}
							</span>
							<p className="m-0 text-sm leading-snug text-muted-foreground">{catalog.detail}</p>
						</div>
						<Badge tone={catalog.editable ? 'success' : 'neutral'} variant="outline">
							{catalog.editable ? 'Editable' : 'Read only'}
						</Badge>
					</article>
				))}
			</div>
		</div>
	);
}

function SettingsDisplayGrid({ fields }: { readonly fields: readonly SettingField[] }) {
	return (
		<div className="grid gap-2 md:grid-cols-4">
			{fields.map((field) => (
				<div
					className="grid min-h-[68px] min-w-0 content-start gap-1.5 rounded-md border border-border/30 bg-muted/40 px-2.5 py-2"
					key={field.label}
				>
					<span className="text-xs font-medium text-muted-foreground">{field.label}</span>
					<span className="font-medium wrap-anywhere text-sm text-foreground">
						{displayFieldValue(field)}
					</span>
				</div>
			))}
		</div>
	);
}
