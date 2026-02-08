import { FormWrapper } from '@simmer/forms/form/form-wrapper';
import { ResetButton } from '@simmer/forms/form/reset-button';
import { SubmitButton } from '@simmer/forms/form/submit-button';
import { useAppForm } from '@simmer/forms/form-context';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
	title: 'Forms/Buttons',
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SubmitButtonDefault: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				field: '',
			},
			onSubmit: ({ value }) => {
				alert(`Submitted: ${JSON.stringify(value)}`);
			},
		});

		return (
			<form.AppForm>
				<FormWrapper>
					<form.AppField name="field">
						{(field) => (
							<field.TextField placeholder="Type something to enable submit" />
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

export const SubmitButtonCustomLabel: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				field: '',
			},
			onSubmit: ({ value }) => {
				alert(`Saved: ${JSON.stringify(value)}`);
			},
		});

		return (
			<form.AppForm>
				<FormWrapper>
					<form.AppField name="field">
						{(field) => <field.TextField placeholder="Enter data" />}
					</form.AppField>
					<form.Subscribe>
						<SubmitButton label="Save Changes" />
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};

export const SubmitButtonWithValidation: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				email: '',
			},
			onSubmit: ({ value }) => {
				alert(`Email submitted: ${value.email}`);
			},
		});

		return (
			<form.AppForm>
				<FormWrapper>
					<form.AppField
						name="email"
						validators={{
							onChange: ({ value }) => {
								if (!value) return 'Email is required';
								if (!value.includes('@')) return 'Invalid email format';
								return undefined;
							},
						}}
					>
						{(field) => (
							<field.TextField
								fieldProps={{
									fieldLabel: 'Email',
									fieldDescription: 'Submit button is disabled until valid',
								}}
								placeholder="user@example.com"
							/>
						)}
					</form.AppField>
					<form.Subscribe>
						<SubmitButton label="Subscribe" />
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};

export const ResetButtonDefault: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				field: 'Initial value',
			},
		});

		return (
			<form.AppForm>
				<FormWrapper>
					{' '}
					<form.AppField name="field">
						{(field) => (
							<field.TextField
								fieldProps={{
									fieldLabel: 'Text Field',
									fieldDescription: 'Modify this field and click Reset',
								}}
								placeholder="Enter text"
							/>
						)}
					</form.AppField>
					<form.Subscribe>
						<ResetButton />
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};

export const ResetButtonCustomLabel: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				field: 'Some data',
			},
		});

		return (
			<form.AppForm>
				<FormWrapper>
					<form.AppField name="field">
						{(field) => <field.TextField placeholder="Enter text" />}
					</form.AppField>
					<form.Subscribe>
						<ResetButton label="Clear Form" />
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};

export const ResetButtonWithCallback: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				field: 'Initial data',
			},
		});

		return (
			<form.AppForm>
				<FormWrapper>
					<form.AppField name="field">
						{(field) => (
							<field.TextField
								fieldProps={{
									fieldLabel: 'Text Field',
									fieldDescription: 'Reset triggers a custom callback',
								}}
								placeholder="Enter text"
							/>
						)}
					</form.AppField>
					<form.Subscribe>
						<ResetButton
							label="Reset & Alert"
							handleReset={() => {
								alert('Form has been reset!');
							}}
						/>
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};

export const AllButtonsTogether: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				name: '',
				email: '',
			},
			onSubmit: ({ value }) => {
				alert(`Form submitted: ${JSON.stringify(value, null, 2)}`);
			},
		});

		return (
			<form.AppForm>
				<FormWrapper>
					{' '}
					<form.AppField
						name="name"
						validators={{
							onChange: ({ value }) =>
								!value ? 'Name is required' : undefined,
						}}
					>
						{(field) => (
							<field.TextField
								fieldProps={{ fieldLabel: 'Name', required: true }}
								placeholder="Enter your name"
							/>
						)}
					</form.AppField>
					<form.AppField
						name="email"
						validators={{
							onChange: ({ value }) => {
								if (!value) return 'Email is required';
								if (!value.includes('@')) return 'Invalid email';
								return undefined;
							},
						}}
					>
						{(field) => (
							<field.TextField
								fieldProps={{ fieldLabel: 'Email', required: true }}
								placeholder="user@example.com"
							/>
						)}
					</form.AppField>
					<form.Subscribe>
						<div className="flex gap-2">
							<SubmitButton label="Submit" />
							<ResetButton label="Reset" />
						</div>
					</form.Subscribe>
				</FormWrapper>
			</form.AppForm>
		);
	},
};
