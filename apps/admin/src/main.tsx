import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './app';
import '@simmer-mosquito/ui-web/styles.css';
import './styles.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
	throw new Error('Root element not found.');
}

createRoot(rootElement).render(
	<StrictMode>
		<AdminApp />
	</StrictMode>,
);
