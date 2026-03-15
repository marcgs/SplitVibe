import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks --------------------------------------------------------

const mockUploadStream = vi.fn().mockResolvedValue({});
const mockDownload = vi.fn().mockResolvedValue({
  readableStreamBody: "fake-stream",
  contentType: "image/jpeg",
  contentLength: 12345,
});

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({
      getContainerClient: vi.fn().mockReturnValue({
        getBlockBlobClient: vi.fn().mockReturnValue({
          url: "http://storage:10000/devstoreaccount1/attachments/test-blob",
          uploadStream: mockUploadStream,
          download: mockDownload,
        }),
      }),
    }),
  },
}));

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn(),
  ManagedIdentityCredential: vi.fn(),
}));

// ---------- tests --------------------------------------------------------

describe("storage client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=fakekey;BlobEndpoint=http://storage:10000/devstoreaccount1;");
    vi.stubEnv("AZURE_STORAGE_ACCOUNT_NAME", "devstoreaccount1");
    vi.stubEnv("AZURE_STORAGE_CONTAINER_NAME", "attachments");
  });

  it("uploadBlob uploads stream and returns blob name", async () => {
    const { uploadBlob } = await import("@/lib/storage");
    const fakeStream = new ReadableStream();
    const result = await uploadBlob(fakeStream, "image/jpeg", "receipt.jpg", 5000);

    expect(result).toHaveProperty("blobName");
    expect(result.blobName).toMatch(/\.jpg$/);
    expect(mockUploadStream).toHaveBeenCalledWith(
      expect.anything(),
      5000,
      undefined,
      { blobHTTPHeaders: { blobContentType: "image/jpeg" } }
    );
  });

  it("downloadBlob returns stream, contentType, and contentLength", async () => {
    const { downloadBlob } = await import("@/lib/storage");
    const result = await downloadBlob("some-blob.jpg");

    expect(result.stream).toBe("fake-stream");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.contentLength).toBe(12345);
    expect(mockDownload).toHaveBeenCalledWith(0);
  });

  it("downloadBlob defaults contentType when missing", async () => {
    mockDownload.mockResolvedValueOnce({
      readableStreamBody: "fake-stream",
      contentType: undefined,
      contentLength: undefined,
    });

    const { downloadBlob } = await import("@/lib/storage");
    const result = await downloadBlob("some-blob.bin");

    expect(result.contentType).toBe("application/octet-stream");
    expect(result.contentLength).toBe(0);
  });
});
