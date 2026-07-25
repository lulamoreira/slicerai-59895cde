import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mail, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Entrar — SlicerAI" },
      { name: "description", content: "Entre no SlicerAI com Google, link mágico ou e-mail e senha para gerar arquivos .3mf." },
      { property: "og:title", content: "Entrar — SlicerAI" },
      { property: "og:description", content: "Acesse sua conta SlicerAI." },
    ],
  }),
  component: AuthPage,
});

function safeNext(next: string | undefined): string {
  if (!next) return "/app";
  if (!next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const dest = safeNext(next);
  const [busy, setBusy] = useState<null | "google" | "magic" | "signin" | "signup">(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    // se já logado, sai
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: dest });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: dest });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, dest]);

  async function signInGoogle() {
    setBusy("google");
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
      if (r.error) toast.error("Falha ao entrar com Google", { description: r.error.message });
    } catch (e) {
      toast.error("Falha ao entrar com Google", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function sendMagicLink() {
    if (!email) return toast.error("Informe seu e-mail");
    setBusy("magic");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/app" },
    });
    setBusy(null);
    if (error) return toast.error("Não foi possível enviar", { description: error.message });
    toast.success("Link enviado!", { description: "Confira seu e-mail." });
  }

  async function signInPass() {
    setBusy("signin");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(null);
    if (error) return toast.error("Falha ao entrar", { description: error.message });
  }

  async function signUpPass() {
    setBusy("signup");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/app",
        data: { full_name: fullName || email.split("@")[0] },
      },
    });
    setBusy(null);
    if (error) return toast.error("Falha ao cadastrar", { description: error.message });
    toast.success("Conta criada!", { description: "Se seu projeto exigir confirmação de e-mail, confira sua caixa de entrada." });
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-primary grid place-items-center text-primary-foreground font-display text-xl mb-3">
            S
          </div>
          <h1 className="font-display text-3xl">SlicerAI</h1>
          <p className="text-sm text-muted-foreground mt-1">Entre para gerar .3mf prontos para o Bambu Studio.</p>
        </div>

        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <Button
            onClick={signInGoogle}
            disabled={busy !== null}
            className="w-full rounded-full h-11 font-semibold"
            variant="outline"
          >
            {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Continuar com Google
          </Button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="magic">
            <TabsList className="grid grid-cols-3 w-full rounded-full">
              <TabsTrigger value="magic" className="rounded-full">Link</TabsTrigger>
              <TabsTrigger value="signin" className="rounded-full">Entrar</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full">Criar</TabsTrigger>
            </TabsList>

            <TabsContent value="magic" className="space-y-3 mt-4">
              <Label htmlFor="email-magic">E-mail</Label>
              <Input id="email-magic" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
              <Button onClick={sendMagicLink} disabled={busy !== null} className="w-full rounded-full h-11">
                {busy === "magic" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar link mágico
              </Button>
            </TabsContent>

            <TabsContent value="signin" className="space-y-3 mt-4">
              <Label htmlFor="email-si">E-mail</Label>
              <Input id="email-si" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Label htmlFor="pass-si">Senha</Label>
              <Input id="pass-si" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button onClick={signInPass} disabled={busy !== null || !email || !password} className="w-full rounded-full h-11">
                {busy === "signin" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Entrar
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-3 mt-4">
              <Label htmlFor="name-su">Nome</Label>
              <Input id="name-su" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <Label htmlFor="email-su">E-mail</Label>
              <Input id="email-su" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Label htmlFor="pass-su">Senha</Label>
              <Input id="pass-su" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" />
              <Button onClick={signUpPass} disabled={busy !== null || !email || password.length < 6} className="w-full rounded-full h-11">
                {busy === "signup" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Criar conta
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Ao continuar você concorda com os termos de uso.
        </p>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
