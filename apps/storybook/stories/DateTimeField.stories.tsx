import { DateTimeField } from '@simmer/forms/fields/date-field';
import { useAppForm } from '@simmer/forms/form-context';
import { Button } from '@simmer/ui/components/button';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
	title: 'Forms/DateTimeField',
	component: DateTimeField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof DateTimeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DateOnly: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				appointmentDate: null as Date | null,
			},
		});

		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className="w-100 space-y-4"
			>
				<form.AppField name="appointmentDate">
					{(field) => <field.DateTimeField placeholder="Pick a date" />}
				</form.AppField>
				<Button type="submit">Submit</Button>
			</form>
		);
	},
};

export const DateWithLabel: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				startDate: null as Date | null,
			},
		});

		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className="w-100 space-y-4"
			>
				<form.AppField name="startDate">
					{(field) => (
						<field.DateTimeField
							fieldProps={{
								fieldLabel: 'Start Date',
								fieldDescription: 'Select when the event begins',
							}}
							placeholder="Select date"
						/>
					)}
				</form.AppField>
				<Button type="submit">Submit</Button>
			</form>
		);
	},
};

export const DateTimeWithInput: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				meetingDateTime: null as Date | null,
			},
		});

		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className="w-100 space-y-4"
			>
				<form.AppField name="meetingDateTime">
					{(field) => (
						<field.DateTimeField
							fieldProps={{
								fieldLabel: 'Meeting Date & Time',
								fieldDescription: 'Choose date and time for the meeting',
							}}
							showTimeInput={true}
							placeholder="Select date and time"
						/>
					)}
				</form.AppField>
				<Button type="submit">Submit</Button>
			</form>
		);
	},
};

export const WithValidation: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				dueDate: null as Date | null,
			},
			onSubmit: ({ value }) => {
				alert(JSON.stringify(value, null, 2));
			},
		});

		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className="w-100 space-y-4"
			>
				<form.AppField
					name="dueDate"
					validators={{
						onChange: ({ value }) => {
							if (!value) return 'Due date is required';
							if (value < new Date()) return 'Due date must be in the future';
							return undefined;
						},
					}}
				>
					{(field) => (
						<field.DateTimeField
							fieldProps={{
								fieldLabel: 'Due Date',
								required: true,
							}}
							placeholder="Select due date"
						/>
					)}
				</form.AppField>
				<Button type="submit">Submit</Button>
			</form>
		);
	},
};

export const Disabled: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				lockedDate: new Date(),
			},
		});

		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className="w-100 space-y-4"
			>
				<form.AppField name="lockedDate">
					{(field) => (
						<field.DateTimeField
							fieldProps={{
								fieldLabel: 'Locked Date',
								fieldDescription: 'This date cannot be changed',
							}}
							disabled={true}
						/>
					)}
				</form.AppField>
				<Button type="submit">Submit</Button>
			</form>
		);
	},
};
