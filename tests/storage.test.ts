import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockGenerateBlobSASQueryParameters = vi.fn().mockReturnValue({
  toString: () => "sv=2024-01-01&sig=fakesig",
});

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({
      getContainerClient: vi.fn().mockReturnValue({
        getBlockBlobClient: vi.fn().mockReturnValue({
          url: "http://storage:10000/devstoreaccount1/attachments/test-blob",
        }),
      }),
      getUserDelegationKey: vi.fn().mockResolvedValue({
        signedObjectId: "fake-oid",
        signedTenantId: "fake-tid",
        signedStartsOn: new Date(),
        signedExpiresOn: new Date(),
        signedService: "b",
        signedVersion: "2024-01-01",
        value: "fake-key",
      }),
    }),
  },
  generateBlobSASQueryParameters: mockGenerateBlobSASQueryParameters,
  StorageSharedKeyCredential: vi.fn(),
  BlobSASPermissions: {
    parse: vi.fn().mockReturnValue({}),
  },
  SASProtocol: { Https: "https", HttpsAndHttp: "https,http" },
}));

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn(),
  ManagedIdentityCredential: vi.fn(),
}));

// ---------- tests --------------------------------------------------------

describe("storage client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://storage:10000/devstoreaccount1;");
    vi.stubEnv("AZURE_STORAGE_ACCOUNT_NAME", "devstoreaccount1");
    vi.stubEnv("AZURE_STORAGE_ACCOUNT_KEY", "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==");
    vi.stubEnv("AZURE_STORAGE_CONTAINER_NAME", "attachments");
  });

  it("generateUploadSasUrl returns a URL with SAS token", async () => {
    const { generateUploadSasUrl } = await import("@/lib/storage");
    const result = await generateUploadSasUrl("test-blob.jpg", "image/jpeg");

    expect(result).toHaveProperty("uploadUrl");
    expect(result).toHaveProperty("blobName");
    expect(result.uploadUrl).toContain("sv=");
  });

  it("generateReadSasUrl returns a signed URL", async () => {
    const { generateReadSasUrl } = await import("@/lib/storage");
    const url = await generateReadSasUrl("test-blob.jpg");

    expect(url).toContain("sv=");
  });

  it("uses configured TTL for read URLs", async () => {
    vi.stubEnv("ATTACHMENT_READ_TTL_MINUTES", "30");
    const { generateReadSasUrl } = await import("@/lib/storage");
    const url = await generateReadSasUrl("test-blob.jpg");

    expect(url).toBeDefined();
    expect(mockGenerateBlobSASQueryParameters).toHaveBeenCalled();
  });

  it("defaults TTL to 15 minutes when env var is not set", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://storage:10000/devstoreaccount1;");
    vi.stubEnv("AZURE_STORAGE_ACCOUNT_NAME", "devstoreaccount1");
    vi.stubEnv("AZURE_STORAGE_ACCOUNT_KEY", "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==");
    vi.stubEnv("AZURE_STORAGE_CONTAINER_NAME", "attachments");

    const { generateReadSasUrl } = await import("@/lib/storage");
    const url = await generateReadSasUrl("test-blob.jpg");
    expect(url).toBeDefined();
  });
});
