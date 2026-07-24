import { createFileRoute } from "@tanstack/react-router";
import { Wizard } from "@/components/slicerai/Wizard";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SlicerAI — Gerador de .3mf para Bambu Studio" },
      { name: "description", content: "Suba um STL, responda o wizard e baixe um .3mf pronto: geometria + presets de impressora, processo, filamento e suporte já embarcados." },
      { property: "og:title", content: "SlicerAI — .3mf pronto para o Bambu Studio" },
      { property: "og:description", content: "Análise de suporte por raycast, orientação otimizada e presets pesquisados por material — 100% no navegador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <>
      <Wizard />
      <Toaster position="top-right" richColors />
    </>
  );
}
