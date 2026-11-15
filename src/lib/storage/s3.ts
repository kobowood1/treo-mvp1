/**
 * S3-compatible storage helper.
 * Uses AWS SDK v3 — configured entirely from env vars.
 * Works with RustFS (dev), AWS S3 (prod), or any S3-compatible service.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
  });
}

const BUCKET = process.env.STORAGE_BUCKET ?? "treo-uploads";
const URL_EXPIRY = parseInt(process.env.STORAGE_URL_EXPIRY_SECONDS ?? "3600", 10);

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadFile(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
      // No ACL — bucket is private
    })
  );
}

// ─── Signed URL (read) ────────────────────────────────────────────────────────

export async function getSignedReadUrl(key: string): Promise<string> {
  const client = getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: URL_EXPIRY }
  );
}

// ─── Delete single object ─────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// ─── Bulk delete (retention cleanup) ─────────────────────────────────────────

export async function deleteFiles(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const client = getS3Client();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    })
  );
}

// ─── Build storage key for a session image ───────────────────────────────────

export function sessionImageKey(params: {
  schoolId: string;
  sessionId: string;
  index: number;
  ext: string;
}): string {
  return `schools/${params.schoolId}/sessions/${params.sessionId}/image-${params.index}.${params.ext}`;
}
