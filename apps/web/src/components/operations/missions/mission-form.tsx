import { type ControlType, createMissionCommand } from '@simmer-mosquito/domain';
import {
	FormSection,
	type RecordFormHeader,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { useState } from 'react';
import {
	NO_ASSIGNEE,
	NO_METHOD,
	NO_NOTIFICATION_TYPE,
	useMissionFormOptions,
} from '../../../hooks/operations/use-mission-form-options';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../lib/domain-validation';
import { localTimeAsInstant, localTimeOfDay, todayInTimeZone } from '../../../lib/local-date';
import { DateControl } from '../../date-control';
import { ControlTypeToggle } from '../control-type-toggle';

/**
 * The mission form, shared by scheduling one and editing one. The defaults
 * and what the save sends are the caller's. Neither touches a lifecycle
 * timestamp: the PATCH handler builds both command families from one body, so
 * an edit that normalised `completedAt` back to null would reopen a finished
 * mission. Stops are added on the mission's own page.
 */

const DEFAULT_START_TIME = '08:00';

/**
 * Domain issue path to the form field holding it, shared by both surfaces
 * because the edit builders name their fields the way the create one does.
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

/**
 * The plan's rules, straight from the domain builder. `createMissionCommand`
 * covers every field in one pass, which is what a form needs, so both surfaces
 * run it and the server still runs the real update builders. A start the form
 * could not read arrives as null and lands on the start date.
 */
export function validateMissionPlan(plan: MissionPlan): unknown {
	return createMissionCommand({
		...FORM_VALIDATION_CONTEXT,
		missionId: FORM_VALIDATION_CONTEXT.organizationId,
		controlType: plan.controlType,
		scheduledStartAt: plan.startAt as Date,
		scheduledEndAt: plan.endAt,
		rainDate: plan.rainDate,
		missionName: plan.missionName,
		plannedMethodId: plan.plannedMethodId,
		assignedToProfileId: plan.assignedToProfileId,
		notificationTypeId: plan.notificationTypeId,
	});
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
 * A stored mission back into form values. `scheduled_start_at` is one
 * `timestamptz`, split into the local date and time off the local parts. The
 * end time is assumed to be on the start's day.
 */
export function missionFormValuesFrom(
	mission: {
		readonly controlType: ControlType;
		readonly scheduledStartAt: Date;
		readonly scheduledEndAt: Date | null;
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
	scheduledStartAt: Date,
	scheduledEndAt: Date | null,
	timeZone: string,
): Pick<MissionFormValues, 'startDate' | 'startTime' | 'endTime'> {
	const start = scheduledStartAt;
	const startTime = localTimeOfDay(scheduledStartAt, timeZone);

	return {
		startDate: Number.isNaN(start.getTime())
			? todayInTimeZone(timeZone)
			: todayInTimeZone(timeZone, start),
		startTime: startTime === '' ? DEFAULT_START_TIME : startTime,
		endTime: localTimeOfDay(scheduledEndAt, timeZone),
	};
}

/**
 * The form's values as the mission the command describes. The sentinels and
 * the empty strings are translated here, once, for both the validator and the
 * save. The scheduled start is a date and a time; the end is a time on the
 * same day. An unreadable pair yields null so the domain builder reports the
 * missing field.
 */
export function readMissionPlan(values: MissionFormValues, timeZone: string): MissionPlan {
	const trimmedName = values.missionName.trim();
	return {
		controlType: values.controlType,
		startAt: organizationInstant(values.startDate, values.startTime, timeZone),
		endAt: organizationInstant(values.startDate, values.endTime, timeZone),
		rainDate: values.rainDate === '' ? null : values.rainDate,
		missionName: trimmedName === '' ? null : trimmedName,
		plannedMethodId: values.plannedMethodId === NO_METHOD ? null : values.plannedMethodId,
		assignedToProfileId:
			values.assignedToProfileId === NO_ASSIGNEE ? null : values.assignedToProfileId,
		notificationTypeId:
			values.notificationTypeId === NO_NOTIFICATION_TYPE ? null : values.notificationTypeId,
	};
}

/**
 * A day and a wall time as the instant they name on the organization's clock,
 * not the browser's.
 */
function organizationInstant(date: string, time: string, timeZone: string): Date | null {
	const instant = localTimeAsInstant(date, time, timeZone);
	return instant === null ? null : new Date(instant);
}

export function MissionFormPage({
	header,
	defaultValues,
	validate,
	fieldPaths,
	canSubmit,
	errorTitle,
	onSave,
}: {
	readonly header: RecordFormHeader;
	readonly defaultValues: MissionFormValues;
	/** The domain builder the caller validates against, create and edit differ. */
	readonly validate: (plan: MissionPlan) => unknown;
	/** Domain issue path → the form field holding it. */
	readonly fieldPaths: Readonly<Record<string, string>>;
	readonly canSubmit: boolean;
	readonly errorTitle: string;
	readonly onSave: (plan: MissionPlan) => Promise<void>;
}) {
	const timeZone = useOrganizationTimeZone();
	const [controlType, setControlType] = useState<ControlType>(defaultValues.controlType);

	const options = useMissionFormOptions(controlType);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: missionFormValidator(validate, fieldPaths, timeZone),
		},
		onSubmit: async ({ value }) => {
			await onSave(readMissionPlan(value, timeZone));
		},
	});

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit} />
					</>
				}
				gap="tight"
				header={header}
				measure="record"
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title={errorTitle} />

				<FormSection title="Plan">
					<form.AppField name="controlType">
						{(field) => (
							<ControlTypeToggle
								description="Sets which methods the mission can plan."
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
								placeholder="Optional, a name crews will recognise"
							/>
						)}
					</form.AppField>

					<form.AppField name="plannedMethodId">
						{(field) => (
							<field.SelectField
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
								Optional planning metadata. It does not reschedule the mission.
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

/** Adapts the caller's builder to the form's `{ value }` validator signature. */
export function missionFormValidator(
	validate: (plan: MissionPlan) => unknown,
	fieldPaths: Readonly<Record<string, string>>,
	timeZone: string,
) {
	return domainValidator(
		({ value }: { readonly value: MissionFormValues }) =>
			validate(readMissionPlan(value, timeZone)),
		fieldPaths,
	);
}
