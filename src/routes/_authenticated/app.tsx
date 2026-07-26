import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Wizard } from "@/components/slicerai/Wizard";
import { Toaster } from "@/components/ui/sonner";
import { useSession, useAccess } from "@/lib/useSession";

type Search = { checkout?: "success" | "cancel" };

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    checkout: s.checkout === "success" || s.checkout === "cancel" ? s.checkout : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Slicer — SlicerAI" },
      { name: "description", content: "Wizard para gerar arquivos .3mf prontos para o Bambu Studio." },
      { property: "og:title", content: "Slicer — SlicerAI" },
      { property: "og:description", content: "Wizard para gerar arquivos .3mf prontos." },
    ],
  }),
  component: AppRoute,
});

function AppRoute() {
  const search = useSearch({ from: "/_authenticated/app" });
  const { user } = useSession();
  const { data: access } = useAccess(user);
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(search.checkout === "success" && !access?.active);

  useEffect(() => {
    if (search.checkout !== "success") return;
    if (access?.active) { setConfirming(false); return; }
    setConfirming(true);
    let tries = 0;
    const iv = setInterval(async () => {
      tries += 1;
      await qc.invalidateQueries({ queryKey: ["access", user?.id] });
      if (tries >= 15) {
        clearInterval(iv);
        setConfirming(false);
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [search.checkout, access?.active, qc, user?.id]);

  useEffect(() => {
    if (access?.active && confirming) setConfirming(false);
  }, [access?.active, confirming]);

  if (confirming) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <h1 className="font-display text-2xl mt-4">Confirmando pagamento…</h1>
          <p className="text-muted-foreground mt-2 text-sm">Isso costuma levar poucos segundos.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Wizard />
      <Toaster position="top-right" richColors />
    </>
  );
}
