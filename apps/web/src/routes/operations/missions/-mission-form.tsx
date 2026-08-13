import type { ControlType, NotificationTypeRow, ProfileRow } from '@simmer-mosquito/sync';
import {
	type RecordFormHeader,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { useMemo, useState } from 'react';
import { DateControl } from '../../../components/date-control';
import { domainValidator } from '../../../forms/domain-validation';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { formatLocalDate, todayInTimeZone } from '../../../lib/local-date';
import { webCollections } from '../../../sync/webCollections';
import { FormSection } from '../../control-operations/-control-form-parts';
import { ControlTypeToggle } from '../-control-type-toggle';
import { useMethodsForControlType } from '../-operations-data';

/**
 * The mission form, shared by scheduling one and editing one.
 *
 * A mission is entirely plan — what kind of work, when, and who — so both
 * surfaces carry the same fields. What differs is the defaults they open with
 * and what the save sends, and both of those are the caller's. The one thing
 * neither touches is a lifecycle timestamp: the PATCH handler builds both command
 * families from one body, so an edit that normalised `completedAt` back to null
 * would reopen a finished mission nobody meant to touch.
 *
 * Stops are not here either. A mission's stops are added on its own page, where
 * there is a map to place them against.
 */

/** Non-empty sentinels: Radix Select forbids empty-string item values. */
const NO_METHOD = 'none';
const NO_ASSIGNEE = 'none';
const NO_NOTIFICATION_TYPE = 'none';

const DEFAULT_START_TIME = '08:00';

/**
 * Domain issue path → the form field holding it.
 *
 * Shared by both surfaces because the edit builders name their fields the same
 * way the create one does — `scheduledStartAt` lands on the start date on either
 * page, and a mapping that drifted would drop a message on the floor.
 */
export const MISSION_FIELD_PATHS: Readonly<Record<string, string>> = {
	controlType: 'controlType',
	scheduledStartAt: 'startDate',
	scheduledEndAt: 'endTime',
	rainDate: 'rainDate',
	missionName: 'missionName',
	plannedMethodId: 'plannedMethodId',
	assignedToProfileId: 'assignedToProfileId',
	notificationTypeId: 'notificationTypeId',
};

export interface MissionFormValues {
	readonly controlType: ControlType;
	/** `YYYY-MM-DD`, paired with `startTime` to make the scheduled start instant. */
	readonly startDate: string;
	/** `HH:MM` local. */
	readonly startTime: string;
	/** `HH:MM` local, or '' for an open-ended mission. */
	readonly endTime: string;
	readonly rainDate: string;
	readonly missionName: string;
	readonly plannedMethodId: string;
	readonly assignedToProfileId: string;
	readonly notificationTypeId: string;
}

export interface MissionPlan {
	readonly controlType: ControlType;
	readonly startAt: Date | null;
	readonly endAt: Date | null;
	readonly rainDate: string | null;
	readonly missionName: string | null;
	readonly plannedMethodId: string | null;
	readonly assignedToProfileId: string | null;
	readonly notificationTypeId: string | null;
}

export function defaultMissionFormValues(timeZone: string): MissionFormValues {
	return {
		controlType: 'application',
		startDate: todayInTimeZone(timeZone),
		startTime: DEFAULT_START_TIME,
		endTime: '',
		rainDate: '',
		missionName: '',
		plannedMethodId: NO_METHOD,
		assignedToProfileId: NO_ASSIGNEE,
		notificationTypeId: NO_NOTIFICATION_TYPE,
	};
}

/**
 * A stored mission back into form values.
 *
 * `scheduled_start_at` is one `timestamptz`; the form splits it into the local
 * date and the local time, read off the local parts rather than the UTC ones so a
 * mission scheduled at 06:00 does not open as the previous evening west of
 * Greenwich. The end time is read the same way and is assumed to be on the start's
 * day, which is the only shape the form can produce.
 */
export function missionFormValuesFrom(
	mission: {
		readonly controlType: ControlType;
		readonly scheduledStartAt: string;
		readonly scheduledEndAt: string | null;
		readonly rainDate: string | null;
		readonly missionName: string | null;
		readonly plannedMethodId: string | null;
		readonly assignedToProfileId: string | null;
		readonly notificationTypeId: string | null;
	},
	timeZone: string,
): MissionFormValues {
	return {
		controlType: mission.controlType,
		...scheduleFieldsFrom(mission.scheduledStartAt, mission.scheduledEndAt, timeZone),
		rainDate: mission.rainDate ?? '',
		missionName: mission.missionName ?? '',
		plannedMethodId: mission.plannedMethodId ?? NO_METHOD,
		assignedToProfileId: mission.assignedToProfileId ?? NO_ASSIGNEE,
		notificationTypeId: mission.notificationTypeId ?? NO_NOTIFICATION_TYPE,
	};
}

/** The stored instants back into the date/time trio the schedule fields hold. */
function scheduleFieldsFrom(
	scheduledStartAt: string,
	scheduledEndAt: string | null,
	timeZone: string,
): Pick<MissionFormValues, 'startDate' | 'startTime' | 'endTime'> {
	const start = new Date(scheduledStartAt);
	const end = scheduledEndAt === null ? null : new Date(scheduledEndAt);

	return {
		startDate: localDateValue(start) ?? todayInTimeZone(timeZone),
		startTime: localTimeValue(start) ?? DEFAULT_START_TIME,
		endTime: (end === null ? null : localTimeValue(end)) ?? '',
	};
}

/** `YYYY-MM-DD` local, or null when the instant is unreadable. */
function localDateValue(date: Date): string | null {
	return Number.isNaN(date.getTime()) ? null : formatLocalDate(date);
}

/** `HH:MM` local, or null when the instant is unreadable. */
function localTimeValue(date: Date): string | null {
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

/**
 * The form's values as the mission the command describes.
 *
 * Every "unset" the form carries is a placeholder the storage layer does not
 * share — Radix forbids an empty-string option value, so absence is spelled with
 * a sentinel, and a cleared text field is `''` rather than null. Both the
 * validator and the save need the same translation, and reading it twice is how
 * the two drift into validating one payload and sending another.
 *
 * The scheduled start is split across a date and a time because that is how a
 * dispatcher thinks about it, while the column is one `timestamptz`; the end is a
 * time on the same day, since a v1 mission does not run overnight. An unreadable
 * pair yields null rather than an Invalid Date, so the domain builder reports the
 * missing field instead of the browser reporting NaN.
 */
function readMissionPlan(values: MissionFormValues): MissionPlan {
	const trimmedName = values.missionName.trim();
	return {
		controlType: values.controlType,
		startAt: toLocalInstant(values.startDate, values.startTime),
		endAt: values.endTime === '' ? null : toLocalInstant(values.startDate, values.endTime),
		rainDate: values.rainDate === '' ? null : values.rainDate,
		missionName: trimmedName === '' ? null : trimmedName,
		plannedMethodId: values.plannedMethodId === NO_METHOD ? null : values.plannedMethodId,
		assignedToProfileId:
			values.assignedToProfileId === NO_ASSIGNEE ? null : values.assignedToProfileId,
		notificationTypeId:
			values.notificationTypeId === NO_NOTIFICATION_TYPE ? null : values.notificationTypeId,
	};
}

function toLocalInstant(date: string, time: string): Date | null {
	if (date === '' || time === '') {
		return null;
	}
	const parsed = new Date(`${date}T${time}`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function MissionFormPage({
	header,
	defaultValues,
	validate,
	fieldPaths,
	canSubmit,
	submitLabel,
	errorTitle,
	onSave,
}: {
	readonly header: RecordFormHeader;
	readonly defaultValues: MissionFormValues;
	/** The domain builder the caller validates against — create and edit differ. */
	readonly validate: (plan: MissionPlan) => unknown;
	/** Domain issue path → the form field holding it. */
	readonly fieldPaths: Readonly<Record<string, string>>;
	readonly canSubmit: boolean;
	readonly submitLabel: string;
	readonly errorTitle: string;
	readonly onSave: (plan: MissionPlan) => Promise<void>;
}) {
	const [saveError, setSaveError] = useState<string | null>(null);
	const [controlType, setControlType] = useState<ControlType>(defaultValues.controlType);

	const options = useMissionFormOptions(controlType);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: domainValidatorFor(validate, fieldPaths),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			const plan = readMissionPlan(value);
			if (plan.startAt === null) {
				setSaveError('Enter the date and time the mission is scheduled to start.');
				return;
			}
			try {
				await onSave(plan);
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save the mission.');
			}
		},
	});

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
					</>
				}
				gap="tight"
				header={header}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title={errorTitle} />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>{errorTitle}</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<FormSection title="Plan">
					<form.AppField name="controlType">
						{(field) => (
							<ControlTypeToggle
								description="What the crew will be doing. It fixes which methods the mission can plan."
								onChange={(next) => {
									field.handleChange(next);
									// The planned method is polymorphic by control type, so one
									// chosen for the old type points at the wrong catalog.
									setControlType(next);
									form.setFieldValue('plannedMethodId', NO_METHOD);
								}}
								value={field.state.value}
							/>
						)}
					</form.AppField>

					<form.AppField name="missionName">
						{(field) => (
							<field.TextField
								label="Mission name"
								placeholder="Optional — a name crews will recognise"
							/>
						)}
					</form.AppField>

					<form.AppField name="plannedMethodId">
						{(field) => (
							<field.SelectField
								description="Optional. What the crew is expected to use; the actual method is recorded on the work itself."
								label="Planned method"
								options={options.methods}
								placeholder="No planned method"
							/>
						)}
					</form.AppField>
				</FormSection>

				<FormSection title="Schedule">
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="startDate">
							{(field) => (
								<DateControl
									label="Start date"
									onChange={field.handleChange}
									required
									value={field.state.value}
								/>
							)}
						</form.AppField>
						<form.AppField name="startTime">
							{(field) => <field.TextField label="Start time" required type="time" />}
						</form.AppField>
					</div>
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="endTime">
							{(field) => (
								<field.TextField
									description="Optional. Leave empty for an open-ended mission."
									label="End time"
									type="time"
								/>
							)}
						</form.AppField>
						<div className="grid gap-1.5">
							<form.AppField name="rainDate">
								{(field) => (
									<DateControl
										label="Rain date"
										onChange={field.handleChange}
										value={field.state.value}
									/>
								)}
							</form.AppField>
							<p className="m-0 text-muted-foreground text-xs">
								Optional. Planning metadata — it does not reschedule the mission.
							</p>
						</div>
					</div>
				</FormSection>

				<FormSection title="Crew and Notice">
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="assignedToProfileId">
							{(field) => (
								<field.SelectField
									label="Assigned to"
									options={options.assignees}
									placeholder="Unassigned"
								/>
							)}
						</form.AppField>
						<form.AppField name="notificationTypeId">
							{(field) => (
								<field.SelectField
									description="Which registrations get notice of this mission."
									label="Notification type"
									options={options.notificationTypes}
									placeholder="No notifications"
								/>
							)}
						</form.AppField>
					</div>
				</FormSection>
			</RecordFormPage>
		</form.AppForm>
	);
}

/** The three catalogs the form picks from, each with its own "unset" first. */
function useMissionFormOptions(controlType: ControlType) {
	const { methods } = useMethodsForControlType(controlType);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: notificationTypes } = useCollectionRows<NotificationTypeRow>(
		webCollections.notificationTypes,
	);

	return {
		methods: useMemo(
			() => [
				{ label: 'No planned method', value: NO_METHOD },
				...lifecycleOptions(
					methods,
					(method) => method.isActive,
					(method) => method.name,
				),
			],
			[methods],
		),
		assignees: useMemo(
			() => [
				{ label: 'Unassigned', value: NO_ASSIGNEE },
				...lifecycleOptions(
					profiles,
					(profile) => profile.isActive,
					(profile) => profile.displayName,
				),
			],
			[profiles],
		),
		notificationTypes: useMemo(
			() => [
				{ label: 'No notifications', value: NO_NOTIFICATION_TYPE },
				...lifecycleOptions(
					notificationTypes,
					(type) => type.isActive,
					(type) => type.name,
				),
			],
			[notificationTypes],
		),
	};
}

/** Adapts the caller's builder to the form's `{ value }` validator signature. */
function domainValidatorFor(
	validate: (plan: MissionPlan) => unknown,
	fieldPaths: Readonly<Record<string, string>>,
) {
	return domainValidator(
		({ value }: { readonly value: MissionFormValues }) => validate(readMissionPlan(value)),
		fieldPaths,
	);
}
