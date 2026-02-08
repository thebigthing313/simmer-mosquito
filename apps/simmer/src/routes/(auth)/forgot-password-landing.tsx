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
import { MailCheckIcon } from 'lucide-react';

export const Route = createFileRoute('/(auth)/forgot-password-landing')({
	component: ForgotPasswordLandingPage,
});

function ForgotPasswordLandingPage() {
	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<div className="mb-4 flex justify-center">
					<div className="rounded-full bg-primary/10 p-3">
						<MailCheckIcon className="h-6 w-6 text-primary" />
					</div>
				</div>
				<CardTitle className="text-center">Check Your Email</CardTitle>
				<CardDescription className="text-center">
					We've sent a password reset link to your email address. Please check
					your inbox and follow the instructions.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm">
					<p className="mb-1 font-medium">Haven't received the email?</p>
					<p className="text-muted-foreground">
						Make sure to check your spam folder. If you still can't find it,
						click the button below to resend the email.
					</p>
				</div>
				<Button variant="outline" className="w-full" asChild>
					<Link to="/forgot-password">Resend Email</Link>
				</Button>
			</CardContent>
			<CardFooter className="flex flex-col gap-2">
				<div className="text-center text-sm">
					<Button variant="link" size="sm" asChild className="px-0">
						<Link to="/login">Back to login</Link>
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}
