import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import { randomUUID } from "crypto";
import { Readable } from "stream";

function isAzurite(): boolean {
  return !!process.env.AZURE_STORAGE_CONNECTION_STRING;
}

function getAccountName(): string {
  return process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "";
}

function getContainerName(): string {
  return process.env.AZURE_STORAGE_CONTAINER_NAME ?? "attachments";
}

function getBlobServiceClient(): BlobServiceClient {
  if (isAzurite()) {
    return BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!
    );
  }
  const accountName = getAccountName();
  const clientId = process.env.AZURE_CLIENT_ID;
  const credential = clientId
    ? new ManagedIdentityCredential(clientId)
    : new DefaultAzureCredential();
  return new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
}

export async function uploadBlob(
  stream: ReadableStream,
  contentType: string,
  originalFileName: string,
  sizeBytes: number
): Promise<{ blobName: string }> {
  const ext = originalFileName.split(".").pop() ?? "";
  const blobName = `${randomUUID()}.${ext}`;

  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(getContainerName());
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const nodeStream = Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]);

  await blockBlobClient.uploadStream(nodeStream, sizeBytes, undefined, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return { blobName };
}

export async function downloadBlob(
  blobName: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; contentLength: number }> {
  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(getContainerName());
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const response = await blockBlobClient.download(0);

  return {
    stream: response.readableStreamBody!,
    contentType: response.contentType ?? "application/octet-stream",
    contentLength: response.contentLength ?? 0,
  };
}
