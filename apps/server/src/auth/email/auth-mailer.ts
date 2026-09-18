export interface AuthMailer {
	sendPasswordResetEmail(input: { readonly to: string; readonly resetUrl: string }): Promise<void>;
}

export interface AuthMailerConfig {
	readonly apiKey: string | null;
	readonly from: string;
	readonly nodeEnv: 'development' | 'production' | 'test';
}
