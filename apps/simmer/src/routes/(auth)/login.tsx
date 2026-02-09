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

export const Route = createFileRoute('/(auth)/login')({
	component: LoginPage,
});

function LoginPage() {
	const form = useAppForm({
		defaultValues: {
			email: '',
			password: '',
		},
		onSubmit: async ({ value }) => {
			// No auth logic yet
			console.log('Login submitted:', value);
		},
	});

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Login</CardTitle>
				<CardDescription>
					Enter your credentials to access your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form.AppForm>
					<FormWrapper>
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
									placeholder="Enter your password"
								/>
							)}
						</form.AppField>
						<div className="flex justify-end">
							<Button variant="link" size="sm" asChild className="px-0">
								<Link to="/forgot-password">Forgot password?</Link>
							</Button>
						</div>
						<form.Subscribe>
							<SubmitButton className="w-full">Login</SubmitButton>
						</form.Subscribe>
					</FormWrapper>
				</form.AppForm>
			</CardContent>
			<CardFooter className="flex flex-col gap-2">
				<div className="text-center text-sm">
					Don't have an account?{' '}
					<Button variant="link" size="sm" asChild className="px-0">
						<Link to="/create-account">Create account</Link>
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}
