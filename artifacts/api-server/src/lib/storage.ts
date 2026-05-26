import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

if (!process.env.CF_R2_ACCOUNT_ID) throw new Error("CF_R2_ACCOUNT_ID is required");
if (!process.env.CF_R2_ACCESS_KEY_ID) throw new Error("CF_R2_ACCESS_KEY_ID is required");
if (!process.env.CF_R2_SECRET_ACCESS_KEY) throw new Error("CF_R2_SECRET_ACCESS_KEY is required");
if (!process.env.CF_R2_BUCKET_NAME) throw new Error("CF_R2_BUCKET_NAME is required");

const endpoint =
  process.env.CF_R2_ENDPOINT ||
  `https://${process.env.CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

export const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
  },
});

export const BUCKET = process.env.CF_R2_BUCKET_NAME;

export async function getUploadUrl(key: string, contentType: string, expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

export async function getDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2, command, { expiresIn });
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function listObjects(prefix?: string) {
  const command = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix });
  const result = await r2.send(command);
  return result.Contents ?? [];
}
