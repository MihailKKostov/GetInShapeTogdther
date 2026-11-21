import { useEffect, useState } from 'react';

/** Object URLs for local previews, created and revoked inside one effect (StrictMode-safe). */
export function useObjectUrls(blobs: (Blob | null | undefined)[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = blobs.map((b) => (b ? URL.createObjectURL(b) : ''));
    setUrls(made);
    return () => made.forEach((u) => u && URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, blobs);
  return urls;
}
