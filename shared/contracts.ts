import { z } from "zod";
export const LIMITS = {
  transfer: 1_000_000_000,
  storage: 8_000_000_000,
  emails: 250,
  users: 100,
  files: 20,
  part: 8 * 1024 * 1024,
  lifetime: 48 * 3600_000,
  uploadLifetime: 24 * 3600_000,
  signedUrl: 300_000,
  operations: 1800,
} as const;
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const createSchema = z.object({
  requestId: z.string().uuid(),
  recipient: emailSchema,
  message: z.string().trim().max(2000),
  files: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .max(240)
          .refine(
            (n) => !/[\x00-\x1f\x7f/\\]/.test(n),
            "Nome de arquivo inválido.",
          ),
        size: z.number().int().positive().max(LIMITS.transfer),
        type: z
          .string()
          .max(150)
          .optional()
          .default("application/octet-stream"),
        lastModified: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(LIMITS.files),
});
export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  active: number;
};
export type Part = { number: number; size: number; etag: string; md5?: string };
export type TransferFile = {
  id: string;
  transfer_id: string;
  name: string;
  size: number;
  type: string;
  last_modified: number;
  object_key: string;
  upload_id: string | null;
  status: "pending" | "uploading" | "complete" | "deleted";
  lease_until: number;
  lease_owner: string | null;
  auth_until: number;
  parts?: Part[];
};
export type Transfer = {
  id: string;
  user_id: string;
  recipient: string;
  message: string;
  total_bytes: number;
  status:
    "uploading" | "ready" | "revoked" | "expired" | "cancelled" | "deleted";
  created_at: number;
  expires_at: number | null;
  upload_expires_at: number;
  files: TransferFile[];
  link?: string;
  mail_status?: string;
  sender?: string;
  requests?: number;
};
export const bytes = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2).replace(".00", "")} GB`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)} MB`
      : n >= 1e3
        ? `${Math.ceil(n / 1e3)} KB`
        : `${n} B`;
