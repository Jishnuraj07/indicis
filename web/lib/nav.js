"use client";
import { useRouter } from "next/navigation";
import { api } from "./api.js";
import { now, useVault } from "./vault.js";

export const noteHref = (id) => `/?n=${encodeURIComponent(id)}`;

/** Open a note (or today's note) from anywhere. */
export function useOpen() {
  const router = useRouter();
  const v = useVault();
  return {
    open: (id) => router.push(noteHref(id)),
    today: async () => {
      const r = await api("/api/daily", { method: "POST", body: JSON.stringify(now()) });
      await v.reload();
      router.push(noteHref(r.id));
    },
  };
}
