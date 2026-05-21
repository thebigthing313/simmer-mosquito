import type { OrganizationSettings } from '@simmer-mosquito/domain';
import type { ControlMethodRow, NotificationTypeRow, OrganizationRow } from '@simmer-mosquito/sync';
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
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppForm } from '../../../forms';
import { AddIcon, CloseIcon, EditIcon } from './constants';
import { ControlMethodLookupList } from './control';
import {
	createNotificationTypeFromValues,
	errorMessageForSave,
	notificationTypeFormValues,
	savePublicSettingsFromValues,
	sortAdultLookupRows,
	updateNotificationTypeFromValues,
	watchPersistence,
} from './helpers';
import { EditSettingsSheet, LookupListFrame } from './layout';
import type { NotificationTypeFormValues } from './types';

export function PublicEngagementSettings({
	canManage,
	notificationTypes,
	organization,
	outreachMethods,
	settings,
}: {
	readonly canManage: boolean;
	readonly notificationTypes: readonly NotificationTypeRow[];
	readonly organization: OrganizationRow | null;
	readonly outreachMethods: readonly ControlMethodRow[];
	readonly settings: OrganizationSettings;
}) {
	return (
		<div className="grid gap-3">
			<ServiceRequestContextGuide settings={settings} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup lists</h3>
				<div className="grid gap-3">
					<ControlMethodLookupList
						canManage={canManage}
						collectionKey="outreachMethods"
						methods={outreachMethods}
						organization={organization}
					/>
					<NotificationTypeLookupList
						canManage={canManage}
						notificationTypes={notificationTypes}
						organization={organization}
					/>
				</div>
			</div>
		</div>
	);
}

export function ServiceRequestContextGuide({
	settings,
}: {
	readonly settings: OrganizationSettings;
}) {
	const context = settings.publicEngagement.serviceRequestContext;
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="grid gap-1">
				<strong className="text-[0.92rem] text-foreground">Service request context</strong>
				<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">
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

export function PublicSettingTile({
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
			<strong className="text-[0.84rem] text-foreground">{label}</strong>
			<span className="text-[0.9rem] font-semibold text-foreground">{value}</span>
			<p className="m-0 text-[0.78rem] leading-snug text-muted-foreground">{detail}</p>
		</div>
	);
}

export function PublicSettingsDrawer({
	canManage,
	organization,
	settings,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
}) {
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
				savePublicSettingsFromValues(organization, settings, {
					radiusAmount: Number(formData.get('Search radius')),
					radiusUnitCode: String(formData.get('Radius unit') ?? ''),
					daysBefore: Number(formData.get('Days before')),
					daysAfter: Number(formData.get('Days after')),
				})
			}
			title="Edit Public engagement"
		/>
	);
}

export function NotificationTypeLookupList({
	canManage,
	notificationTypes,
	organization,
}: {
	readonly canManage: boolean;
	readonly notificationTypes: readonly NotificationTypeRow[];
	readonly organization: OrganizationRow | null;
}) {
	const activeTypes = useMemo(
		() => sortAdultLookupRows(notificationTypes.filter((type) => type.isActive)),
		[notificationTypes],
	);
	const inactiveTypes = useMemo(
		() => sortAdultLookupRows(notificationTypes.filter((type) => !type.isActive)),
		[notificationTypes],
	);

	return (
		<LookupListFrame
			activeCount={activeTypes.length}
			inactiveCount={inactiveTypes.length}
			detail="Notification types classify resident communication such as phone calls, emails, letters, and door notices."
			title="Notification types"
			action={
				<NotificationTypeDrawer
					canManage={canManage}
					organization={organization}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							Add type
						</Button>
					}
				/>
			}
		>
			<NotificationTypeTable
				canManage={canManage}
				notificationTypes={activeTypes}
				organization={organization}
			/>
			{inactiveTypes.length > 0 ? (
				<NotificationTypeTable
					canManage={canManage}
					notificationTypes={inactiveTypes}
					organization={organization}
				/>
			) : null}
		</LookupListFrame>
	);
}

export function NotificationTypeTable({
	canManage,
	notificationTypes,
	organization,
}: {
	readonly canManage: boolean;
	readonly notificationTypes: readonly NotificationTypeRow[];
	readonly organization: OrganizationRow | null;
}) {
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Notification type</TableHead>
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
										notificationType={notificationType}
										organization={organization}
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

export function NotificationTypeDrawer({
	canManage,
	notificationType,
	organization,
	trigger,
}: {
	readonly canManage: boolean;
	readonly notificationType?: NotificationTypeRow | undefined;
	readonly organization: OrganizationRow | null;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const defaultValues: NotificationTypeFormValues = notificationTypeFormValues(notificationType);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					notificationType === undefined
						? createNotificationTypeFromValues(organization, value)
						: updateNotificationTypeFromValues(notificationType, value);
				setOpen(false);
				watchPersistence(
					transaction,
					notificationType === undefined
						? 'Unable to create notification type.'
						: `Unable to save ${notificationType.name}.`,
				);
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
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
							? 'Add notification type'
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
								<form.SubmitButton disabled={!canManage || organization === null} />
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
