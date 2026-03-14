import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  SASProtocol,
} from "@azure/storage-blob";
import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import { randomUUID } from "crypto";

function isAzurite(): boolean {
  return !!process.env.AZURE_STORAGE_CONNECTION_STRING;
}

function getAccountName(): string {
  return process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "";
}

function getContainerName(): string {
  return process.env.AZURE_STORAGE_CONTAINER_NAME ?? "splitvibe-attachments";
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

function getReadTtlMinutes(): number {
  const envVal = process.env.ATTACHMENT_READ_TTL_MINUTES;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 15;
}

async function generateSasToken(
  blobName: string,
  permissions: string,
  expiresOn: Date,
  contentType?: string
): Promise<string> {
  const containerName = getContainerName();
  const startsOn = new Date();

  if (isAzurite()) {
    const accountName = getAccountName();
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY ?? "";
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    return generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse(permissions),
        startsOn,
        expiresOn,
        contentType,
        protocol: SASProtocol.HttpsAndHttp,
      },
      credential
    ).toString();
  }

  const blobServiceClient = getBlobServiceClient();
  console.log("[storage] getUserDelegationKey:", {
    accountName: getAccountName(),
    clientId: process.env.AZURE_CLIENT_ID,
    hasConnectionString: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
    url: blobServiceClient.url,
  });
  const delegationKey = await blobServiceClient.getUserDelegationKey(
    startsOn,
    expiresOn
  );
  return generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn,
      expiresOn,
      contentType,
      protocol: SASProtocol.Https,
    },
    delegationKey,
    getAccountName()
  ).toString();
}

export async function generateUploadSasUrl(
  originalFileName: string,
  contentType: string
): Promise<{ uploadUrl: string; blobName: string }> {
  const ext = originalFileName.split(".").pop() ?? "";
  const blobName = `${randomUUID()}.${ext}`;

  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(getContainerName());
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const expiresOn = new Date(Date.now() + 10 * 60 * 1000);
  const sasToken = await generateSasToken(blobName, "cw", expiresOn, contentType);

  return {
    uploadUrl: `${blockBlobClient.url}?${sasToken}`,
    blobName,
  };
}

export async function generateReadSasUrl(blobName: string): Promise<string> {
  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(getContainerName());
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const ttlMinutes = getReadTtlMinutes();
  const expiresOn = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const sasToken = await generateSasToken(blobName, "r", expiresOn);

  return `${blockBlobClient.url}?${sasToken}`;
}
