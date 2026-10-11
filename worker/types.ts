export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  LOCAL_BUCKET?: R2Bucket;
  APP_ENV: string;
  APP_ORIGIN: string;
  AUTH_SECRET: string;
  PILOT_ENABLED: string;
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_BUCKET: string;
  B2_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  BREVO_API_KEY: string;
  MAIL_FROM: string;
  MAIL_FROM_NAME: string;
}
