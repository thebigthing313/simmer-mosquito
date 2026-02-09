import { FormWrapper } from '@simmer/forms/form/form-wrapper';
import { SubmitButton } from '@simmer/forms/form/submit-button';
import { useAppForm } from '@simmer/forms/form-context';
import { Button } from '@simmer/ui/components/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@simmer/ui/components/card';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/(auth)/create-account')({
	component: CreateAccountPage,
});

function CreateAccountPage() {
	const form = useAppForm({
		defaultValues: {
			firstName: '',
			lastName: '',
			email: '',
			password: '',
			confirmPassword: '',
		},
		onSubmit: async ({ value }) => {
			// No auth logic yet
			console.log('Create account submitted:', value);
		},
	});

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Create Account</CardTitle>
				<CardDescription>
					Fill in your details to create a new account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form.AppForm>
					<FormWrapper>
						<div className="grid grid-cols-2 gap-4">
							<form.AppField name="firstName">
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
							<form.AppField name="lastName">
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
						</div>
						<form.AppField name="email">
							{(field) => (
								<field.TextField
									fieldProps={{
										fieldLabel: 'Email',
										required: true,
									}}
									placeholder="you@example.com"
								/>
							)}
						</form.AppField>
						<form.AppField name="password">
							{(field) => (
								<field.PasswordField
									fieldProps={{
										fieldLabel: 'Password',
										required: true,
									}}
									placeholder="Create a strong password"
								/>
							)}
						</form.AppField>
						<form.AppField name="confirmPassword">
							{(field) => (
								<field.PasswordField
									fieldProps={{
										fieldLabel: 'Confirm Password',
										required: true,
									}}
									placeholder="Confirm your password"
								/>
							)}
						</form.AppField>
						<form.Subscribe>
							<SubmitButton className="w-full">Create Account</SubmitButton>
						</form.Subscribe>
					</FormWrapper>
				</form.AppForm>
			</CardContent>
			<CardFooter className="flex flex-col gap-2">
				<div className="text-center text-sm">
					Already have an account?{' '}
					<Button variant="link" size="sm" asChild className="px-0">
						<Link to="/login">Login</Link>
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}
