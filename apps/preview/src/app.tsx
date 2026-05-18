import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';

export function PreviewApp() {
	return <RouterProvider router={router} />;
}
