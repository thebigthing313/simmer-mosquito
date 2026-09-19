import { createFileRoute } from '@tanstack/react-router';
import { ForgotPasswordPage } from '../components/auth/auth';

export const Route = createFileRoute('/forgot-password')({
	component: ForgotPasswordPage,
});
