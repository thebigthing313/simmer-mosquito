import type { ControlType } from '@simmer-mosquito/domain';
import {
	FormSection,
	type RecordFormHeader,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { useMemo, useState } from 'react';
import { DateControl } from '../../../components/date-control';
import { domainValidator } from '../../../forms/domain-validation';
import { useNotificationTypeRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { localTimeAsInstant, localTimeOfDay, todayInTimeZone } from '../../../lib/local-date';
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
 * A day and a wall time as the instant they name on the agency's clock.
 *
 * The zone is the agency's, not the browser's: a dispatcher scheduling a 6am
 * muster from another zone was writing their own 6am, while the mission list and
 * detail page have always shown the yard's.
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
	const timeZone = useOrganizationTimeZone();
	const [saveError, setSaveError] = useState<string | null>(null);
	const [controlType, setControlType] = useState<ControlType>(defaultValues.controlType);

	const options = useMissionFormOptions(controlType);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: domainValidatorFor(validate, fieldPaths, timeZone),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			const plan = readMissionPlan(value, timeZone);
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
	const profiles = useProfileRoster();
	const notificationTypes = useNotificationTypeRoster();

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
	timeZone: string,
) {
	return domainValidator(
		({ value }: { readonly value: MissionFormValues }) =>
			validate(readMissionPlan(value, timeZone)),
		fieldPaths,
	);
}
