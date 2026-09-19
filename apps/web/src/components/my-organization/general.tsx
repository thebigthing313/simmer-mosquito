import type { OrganizationSettings } from '@simmer-mosquito/domain';
import type { Organization } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { useState } from 'react';
import type { UnitLabel } from '../../hooks/queries/use-unit-labels';
import { AddIcon } from './constants';
import { EditOrganizationDetailsSheet } from './edit-organization-details-sheet';
import { EditUnitDefaultsSheet } from './edit-unit-defaults-sheet';
import {
	formatMailingAddress,
	OrganizationDetailLine,
	organizationDetailsFormValues,
	unitDefaultsFormValues,
} from './helpers';
import { DomainSection } from './layout/domain-section';
import { TagSections } from './tag-sections';
import type { SettingField } from './types';

export function GeneralOrganizationSection({
	organizationFields,
	canManage,
	canManageTags,
	organization,
	organizationName,
	settings,
	timezone,
	unitFields,
	units,
}: {
	readonly organizationFields: readonly SettingField[];
	readonly canManage: boolean;
	/**
	 * The tag catalog is `MANAGER` on the server (`fieldWork.createTag` and its
	 * siblings), not `ADMIN` like the organization profile and unit defaults.
	 */
	readonly canManageTags: boolean;
	readonly organization: Organization;
	readonly organizationName: string;
	readonly settings: OrganizationSettings;
	readonly timezone: string;
	readonly unitFields: readonly SettingField[];
	readonly units: readonly UnitLabel[];
}) {
	const [isCreatingTag, setIsCreatingTag] = useState(false);

	return (
		<>
			<DomainSection
				canManage={canManage}
				editDescription="Update the organization details every member can see."
				editAction={
					<EditOrganizationDetailsSheet
						defaultValues={organizationDetailsFormValues(organization, settings)}
						description="Update the organization details every member can see."
						title={`Edit ${organizationName}`}
					/>
				}
				fields={organizationFields}
				id="organization"
				meta="Current organization details"
				setupItems={[]}
				title={organizationName}
			>
				<OrganizationDetailsSummary organization={organization} timezone={timezone} />
			</DomainSection>

			<DomainSection
				canManage={canManage}
				editDescription="Set default units used across collection forms, summaries, and operational reports."
				editAction={
					<EditUnitDefaultsSheet
						defaultValues={unitDefaultsFormValues(settings.unitDefaults)}
						description="Set default units used across collection forms, summaries, and operational reports."
						title="Edit Unit Defaults"
						units={units}
					/>
				}
				fields={unitFields}
				id="units"
				meta="Measurement choices used across forms and summaries"
				setupItems={[]}
				title="Unit Defaults"
			/>

			<DomainSection
				canManage={canManageTags}
				editDescription="Manage shared labels, display colors, and tag lifecycle state."
				editAction={
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isCreatingTag}
						onClick={() => setIsCreatingTag(true)}
					>
						<AddIcon aria-hidden="true" />
						Add Tag
					</Button>
				}
				fields={[]}
				id="tags"
				meta="Shared record tagging vocabulary"
				setupItems={[]}
				title="Tags"
			>
				<TagSections
					canManage={canManageTags}
					isCreating={isCreatingTag}
					onCancelCreate={() => setIsCreatingTag(false)}
				/>
			</DomainSection>
		</>
	);
}

function OrganizationDetailsSummary({
	organization,
	timezone,
}: {
	readonly organization: Organization;
	readonly timezone: string;
}) {
	const slug = organization.slug;
	const address = formatMailingAddress(organization);

	return (
		<div className="grid gap-3 border-t border-border/50 pt-3 md:grid-cols-[minmax(140px,0.5fr)_minmax(220px,0.9fr)_minmax(260px,1.2fr)]">
			<div className="grid min-w-0 content-start gap-1.5">
				<span className="text-xs leading-tight font-semibold text-muted-foreground">Slug</span>
				{slug === null || slug.length === 0 ? (
					<span className="font-medium text-sm leading-normal text-foreground">Not set</span>
				) : (
					<Badge tone="neutral" variant="outline" className="w-fit max-w-full">
						<span className="truncate">{slug}</span>
					</Badge>
				)}
			</div>
			<div className="grid min-w-0 content-start gap-2">
				<span className="text-xs leading-tight font-semibold text-muted-foreground">Contact</span>
				<OrganizationDetailLine label="Email" value={organization.main_contact_email} />
				<OrganizationDetailLine label="Phone" value={organization.phone_number} />
				<OrganizationDetailLine label="Timezone" value={timezone} />
			</div>
			<div className="grid min-w-0 content-start gap-2">
				<span className="text-xs leading-tight font-semibold text-muted-foreground">
					Mailing address
				</span>
				<p className="m-0 max-w-[56ch] wrap-anywhere text-sm leading-normal text-foreground">
					{address}
				</p>
			</div>
		</div>
	);
}
