import type { OrganizationSettings } from '@simmer-mosquito/domain';
import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from '@simmer-mosquito/ui-web/components/ui/drawer';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { useState } from 'react';
import {
	type CatalogFormValues,
	catalogFields,
	catalogFormValues,
	commitCatalogSave,
} from '../../../components/catalog';
import {
	type CatalogMutations,
	useNotificationTypeMutations,
	useOutreachMethodMutations,
} from '../../../hooks/mutations/use-catalog-mutations';
import { useOrganizationSettingsMutations } from '../../../hooks/mutations/use-organization-settings-mutations';
import {
	type DescribedCatalogRecord,
	useNotificationTypeRecords,
	useOutreachMethodRecords,
} from '../../../hooks/queries/use-catalog-records';
import { AddIcon, CloseIcon, EditIcon } from './constants';
import { ControlMethodLookupList } from './control';
import { serviceRequestContextFrom } from './helpers';
import { EditSettingsSheet, LookupListFrame } from './layout/layout';

export function PublicEngagementSettings({
	canManage,
	canEditMethods,
	settings,
}: {
	readonly canManage: boolean;
	/** Manager-and-above may rename an outreach method; only admin adds one. */
	readonly canEditMethods: boolean;
	readonly settings: OrganizationSettings;
}) {
	const outreachMethods = useOutreachMethodRecords();
	const outreachMethodMutations = useOutreachMethodMutations();

	return (
		<div className="grid gap-3">
			<ServiceRequestContextGuide settings={settings} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup Lists</h3>
				<div className="grid gap-3">
					<ControlMethodLookupList
						canEditMethods={canEditMethods}
						canManage={canManage}
						collectionKey="outreachMethods"
						mutations={outreachMethodMutations}
						records={outreachMethods}
					/>
					<NotificationTypeLookupList canManage={canManage} />
				</div>
			</div>
		</div>
	);
}

function ServiceRequestContextGuide({ settings }: { readonly settings: OrganizationSettings }) {
	const context = settings.publicEngagement.serviceRequestContext;
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="grid gap-1">
				<span className="font-medium text-sm text-foreground">Service request context</span>
				<p className="m-0 text-sm leading-snug text-muted-foreground">
					These defaults decide which nearby records are shown alongside a resident service request
					so staff can see recent local activity.
				</p>
			</div>
			<div className="grid gap-2 md:grid-cols-3">
				<PublicSettingTile
					detail="How far from the request location to look for related records."
					label="Search radius"
					value={`${context.radius.amount} ${context.radius.unitCode}`}
				/>
				<PublicSettingTile
					detail="How many days before the request date are included."
					label="Days before"
					value={String(context.timeWindow.daysBefore)}
				/>
				<PublicSettingTile
					detail="How many days after the request date are included."
					label="Days after"
					value={String(context.timeWindow.daysAfter)}
				/>
			</div>
		</section>
	);
}

function PublicSettingTile({
	detail,
	label,
	value,
}: {
	readonly detail: string;
	readonly label: string;
	readonly value: string;
}) {
	return (
		<div className="grid gap-1 rounded-md border border-border/30 bg-background p-2.5">
			<span className="font-medium text-sm text-foreground">{label}</span>
			<span className="text-sm font-semibold text-foreground">{value}</span>
			<p className="m-0 text-xs leading-snug text-muted-foreground">{detail}</p>
		</div>
	);
}

export function PublicSettingsDrawer({
	canManage,
	settings,
}: {
	readonly canManage: boolean;
	readonly settings: OrganizationSettings;
}) {
	const { setServiceRequestContext } = useOrganizationSettingsMutations();

	return (
		<EditSettingsSheet
			description="Set how much nearby activity is shown when staff review a resident service request."
			fields={[
				{
					kind: 'text',
					label: 'Search radius',
					value: String(settings.publicEngagement.serviceRequestContext.radius.amount),
					editable: canManage,
					inputType: 'number',
				},
				{
					kind: 'text',
					label: 'Radius unit',
					value: settings.publicEngagement.serviceRequestContext.radius.unitCode,
					editable: canManage,
				},
				{
					kind: 'text',
					label: 'Days before',
					value: String(settings.publicEngagement.serviceRequestContext.timeWindow.daysBefore),
					editable: canManage,
					inputType: 'number',
				},
				{
					kind: 'text',
					label: 'Days after',
					value: String(settings.publicEngagement.serviceRequestContext.timeWindow.daysAfter),
					editable: canManage,
					inputType: 'number',
				},
			]}
			onSave={(formData) =>
				setServiceRequestContext(
					serviceRequestContextFrom({
						radiusAmount: Number(formData.get('Search radius')),
						radiusUnitCode: String(formData.get('Radius unit') ?? ''),
						daysBefore: Number(formData.get('Days before')),
						daysAfter: Number(formData.get('Days after')),
					}),
				)
			}
			title="Edit Public Engagement"
		/>
	);
}

function NotificationTypeLookupList({ canManage }: { readonly canManage: boolean }) {
	const { activeRecords: activeTypes, inactiveRecords: inactiveTypes } =
		useNotificationTypeRecords();
	const mutations = useNotificationTypeMutations();

	return (
		<LookupListFrame
			activeCount={activeTypes.length}
			inactiveCount={inactiveTypes.length}
			detail="Notification types classify resident communication such as phone calls, emails, letters, and door notices."
			title="Notification Types"
			action={
				<NotificationTypeDrawer
					canManage={canManage}
					mutations={mutations}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							Add Type
						</Button>
					}
				/>
			}
		>
			<NotificationTypeTable
				canManage={canManage}
				mutations={mutations}
				notificationTypes={activeTypes}
			/>
			{inactiveTypes.length > 0 ? (
				<NotificationTypeTable
					canManage={canManage}
					mutations={mutations}
					notificationTypes={inactiveTypes}
				/>
			) : null}
		</LookupListFrame>
	);
}

function NotificationTypeTable({
	canManage,
	mutations,
	notificationTypes,
}: {
	readonly canManage: boolean;
	readonly mutations: CatalogMutations;
	readonly notificationTypes: readonly DescribedCatalogRecord[];
}) {
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Notification Type</TableHead>
						<TableHead>Description</TableHead>
						<TableHead className="w-28">Status</TableHead>
						{canManage ? <TableHead className="w-16 text-right">Edit</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{notificationTypes.map((notificationType) => (
						<TableRow key={notificationType.id}>
							<TableCell className="font-medium">{notificationType.name}</TableCell>
							<TableCell>{notificationType.description ?? 'Not set'}</TableCell>
							<TableCell>{notificationType.isActive ? 'Active' : 'Inactive'}</TableCell>
							{canManage ? (
								<TableCell className="text-right">
									<NotificationTypeDrawer
										canManage={canManage}
										mutations={mutations}
										notificationType={notificationType}
										trigger={
											<Button type="button" variant="outline" size="icon">
												<EditIcon aria-hidden="true" />
												<span className="sr-only">Edit {notificationType.name}</span>
											</Button>
										}
									/>
								</TableCell>
							) : null}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function NotificationTypeDrawer({
	canManage,
	mutations,
	notificationType,
	trigger,
}: {
	readonly canManage: boolean;
	readonly mutations: CatalogMutations;
	readonly notificationType?: DescribedCatalogRecord | undefined;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const defaultValues: CatalogFormValues = catalogFormValues(notificationType);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					notificationType === undefined
						? 'Unable to create notification type.'
						: `Unable to save ${notificationType.name}.`,
				onWritten: () => setOpen(false),
				save: () =>
					notificationType === undefined
						? mutations.create(catalogFields(value)).then(() => undefined)
						: mutations.save(
								notificationType.id,
								catalogFields(value),
								catalogFields(catalogFormValues(notificationType)),
							),
			});
		},
	});

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<Drawer direction="right" open={open} onOpenChange={updateOpen}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent className="w-[min(680px,100%)] sm:max-w-[680px]">
				<DrawerHeader>
					<DrawerTitle>
						{notificationType === undefined
							? 'Add Notification Type'
							: `Edit ${notificationType.name}`}
					</DrawerTitle>
					<DrawerDescription>
						Manage the display name, description, and lifecycle state.
					</DrawerDescription>
				</DrawerHeader>
				<form.AppForm>
					<form
						className="grid min-h-0 gap-3.5 overflow-y-auto px-4"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<form.FormErrorAlert />
						<form.AppField
							name="name"
							validators={{
								onSubmit: ({ value }) =>
									value.trim().length === 0 ? 'Notification type is required.' : undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label="Notification type"
									disabled={!canManage}
									placeholder="e.g. Phone call"
								/>
							)}
						</form.AppField>
						<form.AppField name="description">
							{(field) => (
								<field.TextareaField
									label="Description"
									disabled={!canManage}
									className="min-h-24"
								/>
							)}
						</form.AppField>
						<form.AppField name="isActive">
							{(field) => <field.SwitchField label="Active" disabled={!canManage} />}
						</form.AppField>
						<DrawerFooter className="px-0">
							<form.FormActions>
								<form.SubmitButton disabled={!canManage || !mutations.canWrite} />
								<DrawerClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
										Cancel
									</Button>
								</DrawerClose>
							</form.FormActions>
						</DrawerFooter>
					</form>
				</form.AppForm>
			</DrawerContent>
		</Drawer>
	);
}
