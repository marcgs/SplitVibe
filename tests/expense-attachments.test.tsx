import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExpenseAttachments from "@/app/(app)/groups/[id]/expense-attachments";

// ---------- mocks --------------------------------------------------------

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

let mockFetchResponses: Array<{ status: number; json: () => Promise<unknown> }> = [];

global.fetch = vi.fn(() => {
  const response = mockFetchResponses.shift();
  return Promise.resolve(response ?? { status: 500, json: () => Promise.resolve({}) });
}) as unknown as typeof fetch;

// Mock URL.createObjectURL for download
global.URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake");
global.URL.revokeObjectURL = vi.fn();

// ---------- helpers ------------------------------------------------------

const defaultProps = {
  expenseId: "exp-1",
  attachments: [] as Array<{ id: string; fileName: string; contentType: string }>,
};

function mockFetch(...responses: Array<{ status: number; body: unknown }>) {
  mockFetchResponses = responses.map((r) => ({
    status: r.status,
    json: () => Promise.resolve(r.body),
    ok: r.status >= 200 && r.status < 300,
  }));
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const response = mockFetchResponses.shift();
    return Promise.resolve(response ?? { status: 500, json: () => Promise.resolve({}), ok: false });
  });
}

// ---------- tests --------------------------------------------------------

describe("ExpenseAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchResponses = [];
  });

  it("renders an attach file button", () => {
    render(<ExpenseAttachments {...defaultProps} />);
    expect(screen.getByLabelText(/attach file/i)).toBeInTheDocument();
  });

  it("renders existing attachments as clickable links", () => {
    render(
      <ExpenseAttachments
        {...defaultProps}
        attachments={[
          { id: "att-1", fileName: "receipt.jpg", contentType: "image/jpeg" },
          { id: "att-2", fileName: "invoice.pdf", contentType: "application/pdf" },
        ]}
      />
    );
    expect(screen.getByText("receipt.jpg")).toBeInTheDocument();
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
  });

  it("shows error for disallowed file type", async () => {
    render(<ExpenseAttachments {...defaultProps} />);

    const input = screen.getByLabelText(/attach file/i);
    const file = new File(["data"], "malware.exe", { type: "application/x-msdownload" });
    // Use fireEvent to bypass the accept attribute filtering in userEvent
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/file type not allowed/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows error for file larger than 10 MB", async () => {
    const user = userEvent.setup();
    render(<ExpenseAttachments {...defaultProps} />);

    const input = screen.getByLabelText(/attach file/i);
    const bigFile = new File([new ArrayBuffer(11 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await user.upload(input, bigFile);

    expect(screen.getByRole("alert")).toHaveTextContent(/10\s*MB/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows error when 5 attachments already exist", async () => {
    const user = userEvent.setup();
    const fiveAttachments = Array.from({ length: 5 }, (_, i) => ({
      id: `att-${i}`,
      fileName: `file${i}.jpg`,
      contentType: "image/jpeg",
    }));
    render(<ExpenseAttachments {...defaultProps} attachments={fiveAttachments} />);

    const input = screen.getByLabelText(/attach file/i);
    const file = new File(["data"], "sixth.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    expect(screen.getByRole("alert")).toHaveTextContent(/maximum.*5/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uploads a valid file and shows it in the list", async () => {
    const user = userEvent.setup();
    mockFetch(
      // Single upload endpoint response
      { status: 201, body: { id: "att-new", fileName: "receipt.jpg", contentType: "image/jpeg" } }
    );

    render(<ExpenseAttachments {...defaultProps} />);

    const input = screen.getByLabelText(/attach file/i);
    const file = new File(["jpeg-data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("receipt.jpg")).toBeInTheDocument();
    });
  });

  it("shows error when upload API fails", async () => {
    const user = userEvent.setup();
    mockFetch(
      { status: 400, body: { error: "Something went wrong on the server" } }
    );

    render(<ExpenseAttachments {...defaultProps} />);

    const input = screen.getByLabelText(/attach file/i);
    const file = new File(["jpeg-data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
    });
  });
});
