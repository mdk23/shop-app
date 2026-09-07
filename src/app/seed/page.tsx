"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function SeedPage() {
  const seed = useMutation(api.seedClothing.seed);
  const [status, setStatus] = useState("Seeding catalog…");
  const router = useRouter();

  useEffect(() => {
    seed({ wipe: true })
      .then((msg) => {
        setStatus("Success! " + (typeof msg === "string" ? msg : ""));
        setTimeout(() => router.push("/dashboard"), 1800);
      })
      .catch((e) => setStatus("Error: " + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-surface gap-4">
      {status.includes("Success") ? (
        <CheckCircle2 className="w-16 h-16 text-green-500 animate-bounce" />
      ) : (
        <Loader2 className="w-16 h-16 text-primary animate-spin" />
      )}
      <h1 className="text-2xl font-black text-on-surface">{status}</h1>
    </div>
  );
}
