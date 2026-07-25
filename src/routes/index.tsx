import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Cpu, Layers, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SlicerAI — Gerador de .3mf para Bambu Studio" },
      { name: "description", content: "Suba um STL, responda um wizard rápido e baixe um .3mf pronto para o Bambu Studio, com presets de impressora, processo e filamento embarcados." },
      { property: "og:title", content: "SlicerAI — Gerador de .3mf para Bambu Studio" },
      { property: "og:description", content: "Wizard client-side que empacota .3mf com todas as configurações prontas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-primary text-primary-foreground grid place-items-center font-display">S</div>
            <span className="font-display text-lg tracking-tight">SlicerAI</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/planos" className="text-sm font-semibold px-3 py-2 hover:text-primary">Planos</Link>
            <Link to="/auth">
              <Button variant="outline" className="rounded-full">Entrar</Button>
            </Link>
            <Link to="/auth" className="hidden md:block">
              <Button className="rounded-full">Começar grátis</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24 text-center">
        <div className="inline-flex rounded-full bg-accent/20 text-accent-foreground px-3 py-1 text-xs font-semibold mb-6">
          🚀 7 dias grátis — sem cartão
        </div>
        <h1 className="font-display text-4xl md:text-6xl leading-tight max-w-3xl mx-auto">
          Do STL ao <span className="text-primary">.3mf pronto</span> em 60 segundos
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          Suba seu STL, responda um wizard rápido e baixe um <strong>.3mf com todos os presets</strong> — impressora, processo, filamento e suporte — prontos para abrir no Bambu Studio.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/auth">
            <Button className="rounded-full h-12 px-6 text-base font-semibold">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/planos">
            <Button variant="outline" className="rounded-full h-12 px-6">Ver planos</Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 md:pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { Icon: Zap, title: "Rápido e local", desc: "Roda 100% no seu navegador. Nada de upload lento nem espera." },
            { Icon: Cpu, title: "Presets embarcados", desc: "Impressora, processo e filamento oficiais do Bambu, tudo dentro do .3mf." },
            { Icon: Layers, title: "Análise de suporte", desc: "Detectamos áreas suspensas e sugerimos a melhor orientação." },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-3xl border bg-card p-6">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-4">
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-display text-lg">{title}</div>
              <p className="text-sm text-muted-foreground mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} SlicerAI — feito para makers.
        </div>
      </footer>
    </div>
  );
}
