import { FormWrapper } from '@simmer/forms/form/form-wrapper';
import { ResetButton } from '@simmer/forms/form/reset-button';
import { SubmitButton } from '@simmer/forms/form/submit-button';
import { useAppForm } from '@simmer/forms/form-context';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
	title: 'Forms/FormWrapper',
	component: FormWrapper,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof FormWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicForm: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				username: '',
				email: '',
			},
			onSubmit: ({ value }) => {
				alert(JSON.stringify(value, null, 2));
			},
		});

		return (
			<form.AppForm>
				<FormWrapper formLabel="User Information" className="w-96 space-y-4">
					<form.AppField name="username">
						{(field) => (
							<field.TextField
								fieldProps={{ fieldLabel: 'Username' }}
								placeholder="Enter username"
							/>
						)}
					</form.AppField>
					<form.AppField name="email">
						{(field) => (
							<field.TextField
								fieldProps={{ fieldLabel: 'Email' }}
								placeholder="user@example.com"
							/>
						)}
					</form.AppField>
					<form.Subscribe>
						<div className="flex gap-2">
							<SubmitButton />
							<ResetButton />
						</div>
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};

export const WithDescription: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				firstName: '',
				lastName: '',
			},
			onSubmit: ({ value }) => {
				alert(JSON.stringify(value, null, 2));
			},
		});

		return (
			<form.AppForm>
				<FormWrapper
					formLabel="Contact Details"
					formDescription="Please enter your contact information below."
					className="w-96 space-y-4"
				>
					<form.AppField name="firstName">
						{(field) => (
							<field.TextField
								fieldProps={{ fieldLabel: 'First Name' }}
								placeholder="John"
							/>
						)}
					</form.AppField>
					<form.AppField name="lastName">
						{(field) => (
							<field.TextField
								fieldProps={{ fieldLabel: 'Last Name' }}
								placeholder="Doe"
							/>
						)}
					</form.AppField>
					<form.Subscribe>
						<SubmitButton />
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};

export const CompleteForm: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				title: '',
				description: '',
				startDate: null as Date | null,
				endDate: null as Date | null,
			},
			onSubmit: ({ value }) => {
				alert(JSON.stringify(value, null, 2));
			},
		});

		return (
			<form.AppForm>
				<FormWrapper
					formLabel="Event Registration"
					formDescription="Fill in the details for your event"
					className="w-125 space-y-4"
				>
					<form.AppField
						name="title"
						validators={{
							onChange: ({ value }) =>
								!value ? 'Title is required' : undefined,
						}}
					>
						{(field) => (
							<field.TextField
								fieldProps={{
									fieldLabel: 'Event Title',
									required: true,
								}}
								placeholder="Enter event title"
							/>
						)}
					</form.AppField>

					<form.AppField name="description">
						{(field) => (
							<field.TextField
								fieldProps={{
									fieldLabel: 'Description',
									fieldDescription: 'Provide additional details',
								}}
								placeholder="Event description"
							/>
						)}
					</form.AppField>

					<form.AppField
						name="startDate"
						validators={{
							onChange: ({ value }) =>
								!value ? 'Start date is required' : undefined,
						}}
					>
						{(field) => (
							<field.DateTimeField
								fieldProps={{
									fieldLabel: 'Start Date',
									required: true,
								}}
								showTimeInput={true}
								placeholder="Select start date"
							/>
						)}
					</form.AppField>

					<form.AppField
						name="endDate"
						validators={{
							onChange: ({ value, fieldApi }) => {
								if (!value) return 'End date is required';
								const startDate = fieldApi.form.getFieldValue('startDate');
								if (startDate && value < startDate) {
									return 'End date must be after start date';
								}
								return undefined;
							},
						}}
					>
						{(field) => (
							<field.DateTimeField
								fieldProps={{
									fieldLabel: 'End Date',
									required: true,
								}}
								showTimeInput={true}
								placeholder="Select end date"
							/>
						)}
					</form.AppField>

					<form.Subscribe>
						<div className="flex gap-2 pt-4">
							<SubmitButton label="Register Event" />
							<ResetButton label="Clear Form" />
						</div>
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};

export const WithCustomButtons: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				name: '',
			},
			onSubmit: ({ value }) => {
				alert(`Form submitted: ${JSON.stringify(value, null, 2)}`);
			},
		});

		return (
			<form.AppForm>
				<FormWrapper formLabel="Simple Form" className="w-96 space-y-4">
					<form.AppField name="name">
						{(field) => (
							<field.TextField
								fieldProps={{ fieldLabel: 'Name' }}
								placeholder="Enter your name"
							/>
						)}
					</form.AppField>
					<form.Subscribe>
						<div className="flex gap-2">
							<SubmitButton label="Save" />
							<ResetButton
								label="Cancel"
								handleReset={() => {
									console.log('Form reset');
								}}
							/>
						</div>
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};
