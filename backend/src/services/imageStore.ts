import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { ImageStorageSettings } from '../config.js'

export interface StoredImage {
  body: Uint8Array
  contentType: string
}

// Somewhere to keep uploaded product photos. Production uses a private Amazon S3 bucket; tests pass
// an in-memory stand-in.
export interface ImageStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  // null when nothing is stored under the key.
  get(key: string): Promise<StoredImage | null>
}

// The only code that talks to Amazon S3. The bucket is private: visitors never reach it directly;
// the API reads photos from it and serves them (routes/productImages.ts).
export function s3ImageStore(settings: ImageStorageSettings): ImageStore {
  const client = new S3Client({
    region: settings.region,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  })
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: settings.bucket, Key: key, Body: body, ContentType: contentType }))
    },
    async get(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: key }))
        if (!object.Body) return null
        return { body: await object.Body.transformToByteArray(), contentType: object.ContentType ?? 'application/octet-stream' }
      } catch (error) {
        // S3 reports a missing key as NoSuchKey only to callers allowed s3:ListBucket; otherwise it
        // answers AccessDenied, which stays a server error here (RUNBOOK 1.7 gives the key both).
        if (error instanceof Error && error.name === 'NoSuchKey') return null
        throw error
      }
    },
  }
}
