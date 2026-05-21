import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { AuthMe } from '../../../auth';
import { useCollectionRows } from '../../../sync/useCollectionRows';
import { AdultSurveillanceSettings } from './adult';
import { collections, US_STATE_SELECT_OPTIONS, US_TIMEZONE_OPTIONS } from './constants';
import { ControlOperationsSettings, ControlSettingsDrawer } from './control';
import { GeneralOrganizationSection } from './general';
import {
	findCurrentOrganization,
	readOrganizationFallback,
	readRole,
	saveAdultSettings,
	selectField,
	textField,
	unitDefaultFields,
} from './helpers';
import { LarvalSettingsDrawer, LarvalSurveillanceSettings } from './larval';
import { DomainSection, OrganizationRouteTabs, PermissionPill } from './layout';
import { PeopleSection } from './people';
import { PublicEngagementSettings, PublicSettingsDrawer } from './public';
import type { OrganizationSectionId, SettingField } from './types';

export function MyOrganizationPage({
	auth,
	section,
}: {
	readonly auth: AuthMe | null;
	readonly section: OrganizationSectionId;
}) {
	const { rows: organizationRows, status } = useCollectionRows(collections.currentOrganization);
	const { rows: units } = useCollectionRows(collections.units);
	const { rows: collectionMethods } = useCollectionRows(collections.collectionMethods);
	const { rows: collectionLures } = useCollectionRows(collections.collectionLures);
	const { rows: habitatTypes } = useCollectionRows(collections.habitatTypes);
	const { rows: applicationMethods } = useCollectionRows(collections.applicationMethods);
	const { rows: sourceReductionMethods } = useCollectionRows(collections.sourceReductionMethods);
	const { rows: biocontrolMethods } = useCollectionRows(collections.biocontrolMethods);
	const { rows: vehicles } = useCollectionRows(collections.vehicles);
	const { rows: equipment } = useCollectionRows(collections.equipment);
	const { rows: outreachMethods } = useCollectionRows(collections.outreachMethods);
	const { rows: notificationTypes } = useCollectionRows(collections.notificationTypes);
	const { rows: profiles } = useCollectionRows(collections.profiles);
	const { rows: tags } = useCollectionRows(collections.tags);
	const organization = findCurrentOrganization(organizationRows, auth);
	const organizationFallback = readOrganizationFallback(auth);
	const role = readRole(auth);
	const canManage = role === 'owner' || role === 'admin';
	const settings = resolveOrganizationSettings(organization?.settings).settings;
	const organizationName =
		organization?.name ?? organizationFallback.name ?? 'Organization details';

	const agencyFields: readonly SettingField[] = [
		textField('Organization name', organization?.name ?? organizationFallback.name ?? ''),
		textField('Slug', organization?.slug ?? organizationFallback.slug ?? '', { editable: false }),
		textField('Main contact', organization?.mainContactEmail ?? '', { inputType: 'email' }),
		textField('Phone', organization?.phoneNumber ?? '', { inputType: 'tel' }),
		textField('Street address', organization?.mailingAddressLine1 ?? ''),
		textField('Apt, suite, etc.', organization?.mailingAddressLine2 ?? ''),
		textField('City', organization?.mailingLocality ?? ''),
		selectField('State', organization?.mailingRegion ?? '', US_STATE_SELECT_OPTIONS),
		textField('ZIP code', organization?.mailingPostalCode ?? ''),
		selectField('Timezone', settings.timezone, US_TIMEZONE_OPTIONS),
	];
	const unitFields = unitDefaultFields(settings.unitDefaults, units);
	const adultFields: readonly SettingField[] = [
		selectField('Collection timing', settings.adultSurveillance.collectionTimingMode, [
			{ label: 'Exact timestamps', value: 'exact_timestamps' },
			{ label: 'Collection date and duration', value: 'collection_date_duration' },
		]),
	];

	return (
		<div className="mx-auto grid w-full max-w-[1120px] gap-2.5">
			<div className="-mx-1 sticky top-0 z-8 grid gap-2 bg-[color-mix(in_oklch,var(--app-stage)_94%,transparent)] px-1 pt-0 pb-2 backdrop-blur-sm">
				<header className="flex items-center justify-between gap-4">
					<div className="grid max-w-[68ch] gap-1">
						<p className="eyebrow">Organization workspace</p>
						<h1 className="m-0 text-[1.38rem] leading-tight font-extrabold text-foreground">
							My Organization
						</h1>
						<p className="m-0 text-[0.92rem] leading-snug text-muted-foreground">
							Agency setup is split by workflow so each domain has room for its own decisions.
						</p>
					</div>
					<PermissionPill role={role} canManage={canManage} />
				</header>

				<OrganizationRouteTabs section={section} />
			</div>

			<div className="grid gap-2">
				{section === 'general' ? (
					<GeneralOrganizationSection
						agencyFields={agencyFields}
						canManage={canManage}
						organization={organization}
						organizationFallback={organizationFallback}
						organizationName={organizationName}
						settings={settings}
						status={status}
						tags={tags}
						timezone={settings.timezone}
						unitFields={unitFields}
						units={units}
					/>
				) : null}
				{section === 'people' ? (
					<PeopleSection
						auth={auth}
						canManage={role === 'owner'}
						organization={organization}
						profiles={profiles}
						role={role}
					/>
				) : null}
				{section === 'adult' ? (
					<DomainSection
						canManage={canManage}
						editDescription="Choose how adult collection timing is recorded by this agency."
						fields={adultFields}
						id="adult"
						meta="Trap collection methods, lures, and adult surveillance references"
						onSave={(formData) => saveAdultSettings(organization, settings, formData)}
						setupItems={[]}
						title="Adult surveillance"
					>
						<AdultSurveillanceSettings
							canManage={canManage}
							collectionLures={collectionLures}
							collectionMethods={collectionMethods}
							fields={adultFields}
							organization={organization}
						/>
					</DomainSection>
				) : null}
				{section === 'larval' ? (
					<DomainSection
						canManage={canManage}
						editDescription="Adjust larval inspection entry rules and the setup lists used during habitat inspections."
						editAction={
							<LarvalSettingsDrawer
								canManage={canManage}
								organization={organization}
								settings={settings}
							/>
						}
						fields={[]}
						id="larval"
						meta="Inspection entry policy and habitat classification"
						setupItems={[]}
						title="Larval surveillance"
					>
						<LarvalSurveillanceSettings
							canManage={canManage}
							habitatTypes={habitatTypes}
							organization={organization}
							policy={settings.larvalSurveillance.inspectionEntryPolicy}
						/>
					</DomainSection>
				) : null}
				{section === 'control' ? (
					<DomainSection
						canManage={canManage}
						editDescription="Adjust control defaults and related operational setup lists."
						editAction={
							<ControlSettingsDrawer
								canManage={canManage}
								organization={organization}
								settings={settings}
							/>
						}
						fields={[]}
						id="control"
						meta="Chemical, source reduction, biological control, and resources"
						setupItems={[]}
						title="Control operations"
					>
						<ControlOperationsSettings
							applicationMethods={applicationMethods}
							biocontrolMethods={biocontrolMethods}
							canManage={canManage}
							organization={organization}
							settings={settings}
							sourceReductionMethods={sourceReductionMethods}
							vehicles={vehicles}
							equipment={equipment}
						/>
					</DomainSection>
				) : null}
				{section === 'public' ? (
					<DomainSection
						canManage={canManage}
						editDescription="Set public engagement context defaults and resident communication lookup lists."
						editAction={
							<PublicSettingsDrawer
								canManage={canManage}
								organization={organization}
								settings={settings}
							/>
						}
						fields={[]}
						id="public"
						meta="Service request context, outreach, and resident notifications"
						setupItems={[]}
						title="Public engagement"
					>
						<PublicEngagementSettings
							canManage={canManage}
							notificationTypes={notificationTypes}
							organization={organization}
							outreachMethods={outreachMethods}
							settings={settings}
						/>
					</DomainSection>
				) : null}
			</div>
		</div>
	);
}
