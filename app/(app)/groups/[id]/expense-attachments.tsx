"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS = 5;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
}

interface ExpenseAttachmentsProps {
  expenseId: string;
  attachments: Attachment[];
}

export default function ExpenseAttachments({
  expenseId,
  attachments: initialAttachments,
}: ExpenseAttachmentsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";

    setError("");

    // Client-side validation
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("File type not allowed. Accepted: JPEG, PNG, WebP, HEIC, PDF.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File exceeds the 10 MB size limit.");
      return;
    }

    if (attachments.length >= MAX_ATTACHMENTS) {
      setError(`Maximum of ${MAX_ATTACHMENTS} attachments per expense reached.`);
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("expenseId", expenseId);

      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to upload file");
        return;
      }

      const saved = await res.json();
      setAttachments((prev) => [...prev, saved]);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  function handleDownload(attachment: Attachment) {
    window.open(`/api/attachments/${attachment.id}`, "_blank");
  }

  return (
    <div className="mt-2">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <button
              key={att.id}
              onClick={() => handleDownload(att)}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              title={`Download ${att.fileName}`}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {att.fileName}
            </button>
          ))}
        </div>
      )}

      <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {uploading ? "Uploading…" : "Attach file"}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.heic,.pdf"
          onChange={handleFileChange}
          disabled={uploading}
          className="sr-only"
          aria-label="Attach file"
        />
      </label>

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
