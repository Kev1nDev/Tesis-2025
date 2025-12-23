type PublicEnv = {
  apiBaseUrl: string;
};

// Expo supports EXPO_PUBLIC_* env vars at runtime.
// Keep it explicit and fail-fast for reproducibility.
export const ENV: PublicEnv = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
};

export function assertEnv(): void {
  if (!ENV.apiBaseUrl) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_BASE_URL. Create a .env file (or set env var) and restart Expo.'
    );
  }
}
