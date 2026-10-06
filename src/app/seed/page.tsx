"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToken } from "@/lib/useShop";

/**
 * Loads sample catalogue data. Nothing runs on page load: seeding is a click, and
 * the destructive "wipe and reseed" needs a second confirmation and an admin account.
 */
export default function SeedPage() {
  const token = useToken();
  const seed = useMutation(api.seedClothing.seed);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const run = async (wipe: boolean) => {
    if (wipe && !window.confirm("This deletes every product, variant, category and image before seeding. Continue?")) {
      return;
    }
    setBusy(true);
    try {
      const msg = await seed({ token, wipe });
      setStatus("Success! " + (typeof msg === "string" ? msg : ""));
      setTimeout(() => router.push("/dashboard"), 1800);
    } catch (e) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const done = status?.startsWith("Success");

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-surface gap-4 p-6">
      {busy ? (
        <Loader2 className="w-16 h-16 text-primary animate-spin" />
      ) : done ? (
        <CheckCircle2 className="w-16 h-16 text-green-500 animate-bounce" />
      ) : null}
      <h1 className="text-2xl font-black text-on-surface text-center">
        {status ?? "Load sample catalogue data"}
      </h1>
      {!done && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => run(false)} loading={busy}>
            Seed sample data
          </Button>
          <Button variant="ghost" onClick={() => run(true)} loading={busy}>
            Wipe and reseed (admin only)
          </Button>
        </div>
      )}
    </div>
  );
}
