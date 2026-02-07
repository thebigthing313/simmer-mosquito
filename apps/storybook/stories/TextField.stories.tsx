import { TextField } from '@simmer/forms/fields/text-field';
import { useAppForm } from '@simmer/forms/form-context';
import { Button } from '@simmer/ui/components/button';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
	title: 'Forms/TextField',
	component: TextField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				username: '',
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
				<form.AppField name="username">
					{(field) => <field.TextField placeholder="Enter your username..." />}
				</form.AppField>
				<Button type="submit">Submit</Button>
			</form>
		);
	},
};

export const BasicWithComponent: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				username: '',
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
				<form.AppField name="username">
					{(field) => <field.TextField placeholder="Enter your username" />}
				</form.AppField>
				<Button type="submit">Submit</Button>
			</form>
		);
	},
};

export const WithLabel: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				email: '',
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
				<form.AppField name="email">
					{(field) => (
						<field.TextField
							fieldProps={{ fieldLabel: 'Email' }}
							placeholder="user@example.com"
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
				email: '',
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
					name="email"
					validators={{
						onChange: ({ value }) => {
							if (!value) return 'Email is required';
							if (!value.includes('@')) return 'Invalid email address';
							return undefined;
						},
					}}
				>
					{(field) => (
						<field.TextField
							fieldProps={{
								fieldLabel: 'Email',
								fieldDescription: "We'll never share your email",
								required: true,
							}}
							placeholder="user@example.com"
						/>
					)}
				</form.AppField>
				<Button type="submit">Submit</Button>
			</form>
		);
	},
};

export const WithDescription: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				username: '',
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
				<form.AppField name="username">
					{(field) => (
						<field.TextField
							fieldProps={{
								fieldLabel: 'Username',
								fieldDescription: 'Choose a unique username for your account',
							}}
							placeholder="Choose a username"
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
				username: 'disabled-user',
			},
		});

		return (
			<form className="w-100 space-y-4">
				<form.AppField name="username">
					{(field) => (
						<field.TextField
							fieldProps={{ fieldLabel: 'Username' }}
							disabled
							placeholder="This field is disabled"
						/>
					)}
				</form.AppField>
			</form>
		);
	},
};

export const MultipleFields: Story = {
	render: () => {
		const form = useAppForm({
			defaultValues: {
				firstName: '',
				lastName: '',
				email: '',
			},
			onSubmit: async (values) => {
				console.log('Form submitted:', values);
				alert(`Form submitted: ${JSON.stringify(values, null, 2)}`);
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
					name="firstName"
					validators={{
						onChange: ({ value }) =>
							!value ? 'First name is required' : undefined,
					}}
				>
					{(field) => (
						<field.TextField
							fieldProps={{
								fieldLabel: 'First Name',
								required: true,
							}}
							placeholder="John"
						/>
					)}
				</form.AppField>

				<form.AppField
					name="lastName"
					validators={{
						onChange: ({ value }) =>
							!value ? 'Last name is required' : undefined,
					}}
				>
					{(field) => (
						<field.TextField
							fieldProps={{
								fieldLabel: 'Last Name',
								required: true,
							}}
							placeholder="Doe"
						/>
					)}
				</form.AppField>

				<form.AppField
					name="email"
					validators={{
						onChange: ({ value }) => {
							if (!value) return 'Email is required';
							if (!value.includes('@')) return 'Invalid email address';
							return undefined;
						},
					}}
				>
					{(field) => (
						<field.TextField
							fieldProps={{
								fieldLabel: 'Email',
								fieldDescription: "We'll use this for account notifications",
								required: true,
							}}
							placeholder="john.doe@example.com"
						/>
					)}
				</form.AppField>

				<div className="flex gap-2">
					<Button type="submit">Submit</Button>
					<Button type="button" variant="outline" onClick={() => form.reset()}>
						Reset
					</Button>
				</div>
			</form>
		);
	},
};
