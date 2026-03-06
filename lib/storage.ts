import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  SASProtocol,
} from "@azure/storage-blob";
import { randomUUID } from "crypto";

function getCredential(): StorageSharedKeyCredential {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "";
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY ?? "";
  return new StorageSharedKeyCredential(accountName, accountKey);
}

function getContainerClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "splitvibe-attachments";
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  return blobServiceClient.getContainerClient(containerName);
}

function getReadTtlMinutes(): number {
  const envVal = process.env.ATTACHMENT_READ_TTL_MINUTES;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 15;
}

export async function generateUploadSasUrl(
  originalFileName: string,
  contentType: string
): Promise<{ uploadUrl: string; blobName: string }> {
  const ext = originalFileName.split(".").pop() ?? "";
  const blobName = `${randomUUID()}.${ext}`;

  const containerClient = getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const credential = getCredential();
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + 10 * 60 * 1000); // 10 min upload window

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "splitvibe-attachments",
      blobName,
      permissions: BlobSASPermissions.parse("cw"),
      startsOn,
      expiresOn,
      contentType,
      protocol: SASProtocol.HttpsAndHttp,
    },
    credential
  ).toString();

  return {
    uploadUrl: `${blockBlobClient.url}?${sasToken}`,
    blobName,
  };
}

export async function generateReadSasUrl(blobName: string): Promise<string> {
  const containerClient = getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const credential = getCredential();
  const startsOn = new Date();
  const ttlMinutes = getReadTtlMinutes();
  const expiresOn = new Date(startsOn.getTime() + ttlMinutes * 60 * 1000);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "splitvibe-attachments",
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
      protocol: SASProtocol.HttpsAndHttp,
    },
    credential
  ).toString();

  return `${blockBlobClient.url}?${sasToken}`;
}
