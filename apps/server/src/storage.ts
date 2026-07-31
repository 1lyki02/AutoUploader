import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ServerConfig } from "./config.js";

export const MULTIPART_PART_SIZE = 8 * 1024 * 1024;

export class ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: ServerConfig) {
    this.client = new S3Client({
      endpoint: config.R2_ENDPOINT,
      region: config.R2_REGION,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async createMultipart(objectKey: string, contentType: string): Promise<string> {
    const result = await this.client.send(new CreateMultipartUploadCommand({
      Bucket: this.config.R2_BUCKET,
      Key: objectKey,
      ContentType: contentType,
    }));
    if (!result.UploadId) throw new Error("Object storage did not return an upload id");
    return result.UploadId;
  }

  async signPart(
    objectKey: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.config.R2_BUCKET,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 3600 },
    );
  }

  async completeMultipart(
    objectKey: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.config.R2_BUCKET,
      Key: objectKey,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }));
    await this.client.send(new HeadObjectCommand({
      Bucket: this.config.R2_BUCKET,
      Key: objectKey,
    }));
  }

  async abortMultipart(objectKey: string, uploadId: string): Promise<void> {
    await this.client.send(new AbortMultipartUploadCommand({
      Bucket: this.config.R2_BUCKET,
      Key: objectKey,
      UploadId: uploadId,
    }));
  }

  async downloadToFile(objectKey: string, destination: string): Promise<void> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.config.R2_BUCKET,
      Key: objectKey,
    }));
    if (!result.Body) throw new Error("Object storage returned an empty body");
    await pipeline(result.Body as NodeJS.ReadableStream, createWriteStream(destination));
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.R2_BUCKET,
      Key: objectKey,
    }));
  }
}

export function makeObjectKey(userId: string, fileName: string, uploadId: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "video";
  const day = new Date().toISOString().slice(0, 10);
  return `${userId}/${day}/${uploadId}-${safeName}`;
}
