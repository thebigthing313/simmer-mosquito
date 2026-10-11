import type React from 'react';
import { displayFieldValue } from '../helpers';
import type { DisplaySettingField } from '../types';
import { OrgSection } from './org-section';
import { OrgSurface } from './org-surface';
import { SectionHeader } from './section-header';

/**
 * One My Organization section: its header, with the edit action for a viewer
 * who can manage the Organization, and its body. A section with no body of its
 * own draws `displayFields` as a read-only grid.
 */
export function DomainSection({
	canManage,
	children,
	displayFields = [],
	editAction,
	id,
	meta,
	title,
}: {
	readonly canManage: boolean;
	readonly children?: React.ReactNode;
	readonly displayFields?: readonly DisplaySettingField[];
	readonly editAction?: React.ReactNode;
	readonly id: string;
	readonly meta: string;
	readonly title: string;
}) {
	const action = canManage && editAction !== undefined ? editAction : null;

	return (
		<OrgSection id={id}>
			<OrgSurface>
				<SectionHeader action={action} meta={meta} title={title} />
				{children ??
					(displayFields.length === 0 ? null : <SettingsDisplayGrid fields={displayFields} />)}
			</OrgSurface>
		</OrgSection>
	);
}

function SettingsDisplayGrid({ fields }: { readonly fields: readonly DisplaySettingField[] }) {
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
