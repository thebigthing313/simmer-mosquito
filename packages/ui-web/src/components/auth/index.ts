/**
 * The parts of a sign-in form that both front doors share.
 *
 * The organization workspace (`apps/web`) and the operator console
 * (`apps/admin`) run the same in-app email + password flow against the same
 * public `/auth/*` endpoints (ADR 0010), and `@simmer-mosquito/auth/browser`
 * already gives them one typed outcome union. What they had written twice was
 * the UI that renders it: the destructive alert, the credentials fieldset with
 * its autofill hints, and the verification-code step.
 *
 * Fields only — no shell, no navigation, no `fetch`. What each app keeps is what
 * genuinely differs: its own front door (web's map-room stage, the console's
 * centred card), and its own answer to WorkOS's organization challenge, which
 * web resolves with a picker and the console refuses outright.
 */

export { AuthFormError } from './auth-form-error';
export { AuthSubmitButton } from './auth-submit-button';
export { CredentialsFields } from './credentials-fields';
export { VerificationCodeFields } from './verification-code-fields';
