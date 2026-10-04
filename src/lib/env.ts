import { z } from "zod";

const serverEnvSchema = z
  .object({
    NEXT_PUBLIC_SITE_URL: z.url(),
    SUPABASE_URL: z.url().refine((value) => {
      if (value.startsWith("https://")) return true;
      const host = new URL(value).hostname;
      return process.env.NODE_ENV === "development" && (host === "localhost" || host === "127.0.0.1" || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host));
    }, "must use HTTPS outside local development"),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    RATE_LIMIT_SECRET: z.string().min(32),
    CONSENT_VERSION: z.string().min(1).max(40),
    CRON_SECRET: z.string().min(32),
  })
  .superRefine((value, context) => {
    const site = new URL(value.NEXT_PUBLIC_SITE_URL);
    const localDevelopmentHost = site.hostname === "localhost" || site.hostname === "127.0.0.1" || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(site.hostname);
    if (site.protocol !== "https:" && !(process.env.NODE_ENV === "development" && localDevelopmentHost)) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_SITE_URL"],
        message: "must use HTTPS outside localhost",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function readServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}

let cached: ServerEnv | undefined;

export function serverEnv() {
  cached ??= readServerEnv(process.env);
  return cached;
}
