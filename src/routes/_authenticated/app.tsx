import { createFileRoute } from "@tanstack/react-router";
import { Wizard } from "@/components/slicerai/Wizard";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Slicer — SlicerAI" },
      { name: "description", content: "Wizard para gerar arquivos .3mf prontos para o Bambu Studio." },
      { property: "og:title", content: "Slicer — SlicerAI" },
      { property: "og:description", content: "Wizard para gerar arquivos .3mf prontos." },
    ],
  }),
  component: () => (
    <>
      <Wizard />
      <Toaster position="top-right" richColors />
    </>
  ),
});
