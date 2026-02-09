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

export const Route = createFileRoute('/(auth)/forgot-password')({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const form = useAppForm({
		defaultValues: {
			email: '',
		},
		onSubmit: async ({ value }) => {
			// No auth logic yet
			console.log('Forgot password submitted:', value);
		},
	});

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Forgot Password</CardTitle>
				<CardDescription>
					Enter your email address and we'll send you a link to reset your
					password
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
						<form.Subscribe>
							<SubmitButton className="w-full">Send Reset Link</SubmitButton>
						</form.Subscribe>
					</FormWrapper>
				</form.AppForm>
			</CardContent>
			<CardFooter className="flex flex-col gap-2">
				<div className="text-center text-sm">
					Remember your password?{' '}
					<Button variant="link" size="sm" asChild className="px-0">
						<Link to="/login">Back to login</Link>
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}
