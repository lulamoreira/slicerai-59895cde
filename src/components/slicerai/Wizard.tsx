import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Upload, Printer as PrinterIcon, Palette, Target, Scan, Sliders, Download,
  Copy, RefreshCw, Github, History as HistoryIcon, Hexagon, AlertTriangle,
  CheckCircle2, XCircle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { Preview3D, LegendChip } from "./Preview3D";
import { parseSTL } from "@/lib/slicerai/stl";
import {
  loadPrinters, OPEN_PRINTERS, getUpdatedAt, silentSync,
  listMaterialsForPrinter, buildMaterialFromName,
} from "@/lib/slicerai/catalog";
import { analyzeAllOrientations, pickBestOrientation, purposeToTreePreference } from "@/lib/slicerai/support";
import { generate3mfAsync, previewValidation, type ValidationReport } from "@/lib/slicerai/threemf";
import { loadHistory, saveHistory, putStl, getStl } from "@/lib/slicerai/storage";
import type {
  HistoryEntry, MaterialBase, OrientationResult, Printer, Purpose, STLMesh, WizardState,
} from "@/lib/slicerai/types";


const STEPS = [
  { id: 1, label: "STL", icon: Upload },
  { id: 2, label: "Impressora", icon: PrinterIcon },
  { id: 3, label: "Material", icon: Palette },
  { id: 4, label: "Finalidade", icon: Target },
  { id: 5, label: "Análise", icon: Scan },
  { id: 6, label: "Avançado", icon: Sliders },
  { id: 7, label: "Gerar", icon: Download },
];

const PURPOSES: Array<{ id: Purpose; label: string; desc: string }> = [
  { id: "decoracao", label: "Decoração/Display", desc: "Camadas finas, paredes médias, preenchimento leve." },
  { id: "mecanica", label: "Mecânica/Funcional", desc: "Paredes grossas, preenchimento denso, sem detalhe fino." },
  { id: "miniatura", label: "Miniatura/Detalhe fino", desc: "Camadas ultra finas, tree organic, velocidade lenta." },
  { id: "prototipo", label: "Protótipo rápido", desc: "Camadas grossas, poucas paredes, alta velocidade." },
  { id: "flexivel", label: "Peça flexível", desc: "TPU, velocidades reduzidas, preenchimento gyroid leve." },
];

const BED_TYPES = ["Textured PEI Plate", "Smooth PEI Plate", "Cool Plate", "Engineering Plate", "High Temp Plate"];

function initialState(): WizardState {
  return {
    mesh: null,
    printer: null,
    centerOnBed: true,
    material: null,
    color: "#F5C518",
    purpose: null,
    analysis: null,
    orientations: [],
    chosenOrientationKey: "original",
    overrides: {},
    supportMode: "auto",
    bed: "Textured PEI Plate",
    ironing: { type: undefined, flow: "10%", spacing: "0.1", speed: "20" },
  };
}

const LS_LAST_PRINTER = "slicerai.lastPrinterId";

export function Wizard() {
  const [step, setStep] = useState(1);
  const [printers, setPrinters] = useState<Printer[]>(() => loadPrinters());
  const [state, setState] = useState<WizardState>(() => {
    const s = initialState();
    try {
      const lastId = localStorage.getItem(LS_LAST_PRINTER);
      const list = loadPrinters();
      const def = list.find((p) => p.id === lastId)
        ?? list.find((p) => p.id === "Bambu Lab A1 0.4 nozzle")
        ?? list[0]
        ?? null;
      s.printer = def;
    } catch { /* ignore */ }
    return s;
  });
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(() => getUpdatedAt());
  const [analyzing, setAnalyzing] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  const patch = useCallback((p: Partial<WizardState>) => setState((s) => ({ ...s, ...p })), []);

  // Persist last selected printer
  useEffect(() => {
    if (state.printer?.id) {
      try { localStorage.setItem(LS_LAST_PRINTER, state.printer.id); } catch { /* ignore */ }
    }
  }, [state.printer?.id]);


  const chosenOri = useMemo(
    () => state.orientations.find((o) => o.key === state.chosenOrientationKey) ?? null,
    [state.orientations, state.chosenOrientationKey],
  );

  const bedFits = useMemo(() => {
    if (!state.mesh || !state.printer) return true;
    const [x, y, z] = state.mesh.bbox.size;
    const [bx, by, bz] = state.printer.bed;
    return x <= bx && y <= by && z <= bz;
  }, [state.mesh, state.printer]);

  const handleFile = useCallback(async (file: File) => {
    try {
      const mesh = await parseSTL(file);
      if (mesh.triCount === 0) throw new Error("Nenhum triângulo encontrado no STL.");
      patch({ mesh, analysis: null, orientations: [] });
      toast.success(`STL carregado: ${mesh.triCount.toLocaleString()} triângulos`);
      setStep(2);
    } catch (e) {
      toast.error(`Falha ao ler STL: ${(e as Error).message}`);
    }
  }, [patch]);

  // Silent sync — never blocks the UI, never surfaces errors.
  const runSilentSync = useCallback(async () => {
    setSyncing(true);
    try {
      await silentSync();
      setPrinters(loadPrinters());
      setSyncedAt(getUpdatedAt());
    } finally {
      setSyncing(false);
    }
  }, []);

  // Auto-sync on mount (fire-and-forget). silentSync() short-circuits if the
  // local cache is fresh (<6h), so this is cheap on repeat visits.
  useEffect(() => {
    void runSilentSync();
  }, [runSilentSync]);

  // Dynamic materials list, derived from the master index for the selected printer.
  const materialsForPrinter = useMemo<MaterialBase[]>(() => {
    if (!state.printer) return [];
    return listMaterialsForPrinter(state.printer);
  }, [state.printer, syncedAt]);

  // If the selected material doesn't fit the new printer, clear it.
  useEffect(() => {
    if (!state.material || !state.printer) return;
    if (materialsForPrinter.length === 0) return;
    const stillValid = materialsForPrinter.some((m) => m.id === state.material!.id);
    if (!stillValid) patch({ material: null });
  }, [materialsForPrinter, state.material, state.printer, patch]);

  const runAnalysis = useCallback(async () => {
    if (!state.mesh || !state.printer) return;
    setAnalyzing(true);
    try {
      // Run in next tick so UI updates
      await new Promise((r) => setTimeout(r, 30));
      const orientations = analyzeAllOrientations(state.mesh, state.material, state.printer.bed);
      const best = pickBestOrientation(orientations);
      const chosen = best;
      let a = chosen.analysis;
      // Refine type by purpose preference
      if (a.needsSupport && purposeToTreePreference(state.purpose) && a.suggestedType !== "tree") {
        a = { ...a, suggestedType: "tree", reason: a.reason + " (Ajuste: finalidade Miniatura → TREE.)" };
      }
      patch({ orientations, chosenOrientationKey: chosen.key, analysis: a });
      toast.success("Análise concluída");
    } catch (e) {
      toast.error(`Erro na análise: ${(e as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  }, [state.mesh, state.printer, state.material, state.purpose, patch]);

  useEffect(() => {
    if (step === 5 && state.mesh && state.printer && !state.analysis && !analyzing) {
      runAnalysis();
    }
  }, [step, state.mesh, state.printer, state.analysis, analyzing, runAnalysis]);

  // When orientation changes, update analysis to that orientation's result
  useEffect(() => {
    if (chosenOri && state.analysis && chosenOri.analysis !== state.analysis) {
      patch({ analysis: chosenOri.analysis });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.chosenOrientationKey]);

  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<{
    url: string;
    fileName: string;
    summary: string;
    reportUrl: string;
    reportFileName: string;
  } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const onGenerate = useCallback(async () => {
    setGenError(null);
    const { mesh, printer, material, purpose } = state;
    if (!mesh || !printer || !material || !purpose) {
      setGenError("Complete STL, impressora, material e finalidade antes de gerar.");
      toast.error("Estado incompleto para geração");
      return;
    }
    setGenerating(true);
    try {
      const res = await generate3mfAsync(state);
      const url = URL.createObjectURL(res.blob);
      const reportUrl = URL.createObjectURL(res.report.blob);
      setLastResult({
        url,
        fileName: res.fileName,
        summary: res.summary,
        reportUrl,
        reportFileName: res.report.fileName,
      });
      const id = crypto.randomUUID();
      const entry: HistoryEntry = {
        id,
        createdAt: Date.now(),
        fileName: mesh.fileName,
        printerId: printer.id,
        materialId: material.id,
        purpose,
        color: state.color,
        supportMode: state.supportMode,
        settingsJson: JSON.stringify(res.settings),
        bed: state.bed,
        centerOnBed: state.centerOnBed,
        chosenOrientationKey: state.chosenOrientationKey,
        overrides: state.overrides,
        ironing: state.ironing,
        outputFileName: res.fileName,
      };
      // Persist original STL bytes for reuse from history
      try {
        await putStl(id, mesh.sourceBuffer ?? new ArrayBuffer(0));
      } catch { /* ignore */ }
      saveHistory(entry);
      setHistory(loadHistory());
      toast.success(".3mf + relatório gerados");
    } catch (e) {
      setGenError((e as Error).message);
      toast.error("Falha na geração");
    } finally {
      setGenerating(false);
    }
  }, [state]);

  // ---- Validation preview (step 7) ----
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const runValidation = useCallback(async () => {
    setValidating(true);
    try {
      const rep = await previewValidation(state);
      setValidation(rep);
    } catch (e) {
      setValidation({
        ok: false, needsSync: false, keyCount: 0,
        dssSlots: { process: [], filament: [], printer: [], length: 0 },
        plateOk: false, plateInfo: null,
        modelMetadataOk: false, modelSettingsOk: false, sliceInfoOk: false,
        processLeaf: null, filamentLeaf: null,
        errors: [(e as Error).message], warnings: [],
      });
    } finally {
      setValidating(false);
    }
  }, [state]);

  useEffect(() => {
    if (step !== 7) return;
    setValidation(null);
    runValidation();
  }, [step, runValidation]);




  const canNext = useMemo(() => {
    switch (step) {
      case 1: return !!state.mesh;
      case 2: return !!state.printer;
      case 3: return !!state.material && /^#[0-9A-Fa-f]{6}$/.test(state.color);
      case 4: return !!state.purpose;
      case 5: return !!state.analysis;
      case 6: return true;
      default: return true;
    }
  }, [step, state]);

  const progress = (step / STEPS.length) * 100;

  const openWarning = state.printer && state.material?.open && OPEN_PRINTERS.has(state.printer.printerModel);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-[720px] mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hexagon className="w-7 h-7 text-primary" strokeWidth={2.5} />
            <div>
              <h1 className="text-xl font-bold tracking-tight">SlicerAI</h1>
              <p className="text-xs text-muted-foreground">Gera .3mf pronto para o Bambu Studio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {syncedAt && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {syncing ? "Sincronizando…" : `Atualizado ${new Date(syncedAt).toLocaleString("pt-BR")}`}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[720px] mx-auto px-4 py-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Etapa {step} de {STEPS.length}: {STEPS[step - 1].label}</span>
            <span className="text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
          <div className="flex gap-1 overflow-x-auto pb-1">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const active = s.id === step;
              const done = s.id < step;
              return (
                <button
                  key={s.id}
                  onClick={() => (s.id === 1 || state.mesh) && setStep(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                    active ? "bg-primary text-primary-foreground" : done ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-4">
            {step === 1 && <StepFile onFile={handleFile} mesh={state.mesh} />}
            {step === 2 && (
              <StepPrinter
                printers={printers}
                state={state}
                bedFits={bedFits}
                onChange={patch}
              />
            )}
            {step === 3 && (
              <StepMaterial
                state={state}
                materials={materialsForPrinter}
                openWarning={!!openWarning}
                onChange={patch}
              />
            )}
            {step === 4 && <StepPurpose state={state} onChange={patch} />}
            {step === 5 && (
              <StepAnalysis
                state={state}
                analyzing={analyzing}
                onRerun={runAnalysis}
                onChange={patch}
              />
            )}
            {step === 6 && <StepAdvanced state={state} onChange={patch} />}
            {step === 7 && (
              <StepGenerate
                state={state}
                generating={generating}
                genError={genError}
                lastResult={lastResult}
                onGenerate={onGenerate}
                validation={validation}
                validating={validating}
                onRevalidate={runValidation}
                onSync={runSilentSync}
                syncing={syncing}
              />
            )}


            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
                Voltar
              </Button>
              {step < STEPS.length ? (
                <Button onClick={() => setStep(Math.min(STEPS.length, step + 1))} disabled={!canNext}>
                  Próxima
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setState(initialState());
                    setLastResult(null);
                    setGenError(null);
                    setStep(1);
                  }}
                >
                  Recomeçar
                </Button>
              )}
            </div>

          </div>

          <div className="space-y-3">
            <Card className="overflow-hidden">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  Preview 3D
                  {state.mesh && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {state.mesh.bbox.size[0].toFixed(1)} × {state.mesh.bbox.size[1].toFixed(1)} × {state.mesh.bbox.size[2].toFixed(1)} mm
                      {" · "}
                      {(state.mesh.volumeMm3 / 1000).toFixed(1)} cm³
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[420px]">
                  {state.mesh ? (
                    <Preview3D
                      mesh={state.mesh}
                      rotation={chosenOri?.rotation}
                      faceFlags={step >= 5 ? state.analysis?.faceFlags : undefined}
                      color={state.color}
                      bed={state.printer?.bed ?? null}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Suba um STL para ver o preview
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            {step >= 5 && <LegendChip analysis={state.analysis} />}

            <HistoryCard history={history} onReuse={async (entry) => {
              const p = printers.find((x) => x.id === entry.printerId) ?? state.printer;
              let m: MaterialBase | null = null;
              if (p) {
                const list = listMaterialsForPrinter(p);
                m = list.find((x) => x.id === entry.materialId)
                  ?? (entry.materialId.includes("@BBL") ? buildMaterialFromName(entry.materialId, p.suffix) : null)
                  ?? state.material;
              }
              let mesh: STLMesh | null = null;
              try {
                const buf = await getStl(entry.id);
                if (buf) {
                  const file = new File([buf], entry.fileName, { type: "model/stl" });
                  mesh = await parseSTL(file);
                }
              } catch { /* ignore */ }

              const patchState: Partial<WizardState> = {
                printer: p,
                material: m,
                purpose: entry.purpose,
                color: entry.color,
                supportMode: entry.supportMode as WizardState["supportMode"],
                bed: entry.bed ?? state.bed,
                centerOnBed: entry.centerOnBed ?? state.centerOnBed,
                overrides: entry.overrides ?? {},
                ironing: entry.ironing ?? state.ironing,
                chosenOrientationKey: entry.chosenOrientationKey ?? "original",
              };
              if (mesh) {
                patchState.mesh = mesh;
                patchState.analysis = null;
                patchState.orientations = [];
              }
              patch(patchState);

              if (mesh && p && m) {
                try {
                  const orientations = analyzeAllOrientations(mesh, m, p.bed);
                  const key = entry.chosenOrientationKey ?? "original";
                  const chosen = orientations.find((o) => o.key === key) ?? orientations[0];
                  let a = chosen.analysis;
                  if (a.needsSupport && purposeToTreePreference(entry.purpose) && a.suggestedType !== "tree") {
                    a = { ...a, suggestedType: "tree", reason: a.reason + " (Ajuste: finalidade Miniatura → TREE.)" };
                  }
                  patch({ orientations, chosenOrientationKey: chosen.key, analysis: a });
                } catch { /* ignore */ }
                setStep(7);
                toast.success("Histórico restaurado — pronto para gerar");
              } else {
                toast.warning("Modelo não encontrado, faça upload novamente");
                setStep(1);
              }
            }} />

          </div>
        </div>
      </div>
      <footer className="max-w-[720px] mx-auto px-4 py-8 text-center text-xs text-muted-foreground">
        SlicerAI · 100% client-side · Os valores de flow são ponto de partida — calibre em 1 spool.
      </footer>
    </div>
  );
}

// -------- Steps --------

function StepFile({ onFile, mesh }: { onFile: (f: File) => void; mesh: STLMesh | null }) {
  const [drag, setDrag] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> Enviar STL</CardTitle>
        <CardDescription>Aceita STL binário e ASCII. Processamento 100% no navegador.</CardDescription>
      </CardHeader>
      <CardContent>
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault(); setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
            drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <Upload className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Arraste um .stl aqui</p>
          <p className="text-xs text-muted-foreground mt-1">ou clique para escolher</p>
          <input
            type="file"
            accept=".stl"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        {mesh && (
          <div className="mt-4 text-sm space-y-1">
            <div><strong>Arquivo:</strong> {mesh.fileName}</div>
            <div><strong>Triângulos:</strong> {mesh.triCount.toLocaleString("pt-BR")}</div>
            <div><strong>Volume aproximado:</strong> {(mesh.volumeMm3 / 1000).toFixed(2)} cm³</div>
            <div><strong>Bounding box:</strong> {mesh.bbox.size.map((v) => v.toFixed(1)).join(" × ")} mm</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepPrinter({
  printers, state, bedFits, onChange,
}: {
  printers: Printer[]; state: WizardState; bedFits: boolean;
  onChange: (p: Partial<WizardState>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PrinterIcon className="w-4 h-4" /> Impressora</CardTitle>
        <CardDescription>Catálogo local + sincronização com o GitHub da Bambulab.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Modelo</Label>
          <Select
            value={state.printer?.id ?? ""}
            onValueChange={(id) => onChange({ printer: printers.find((p) => p.id === id) ?? null })}
          >
            <SelectTrigger><SelectValue placeholder="Selecione a impressora" /></SelectTrigger>
            <SelectContent>
              {printers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName} · {p.bed[0]}×{p.bed[1]}×{p.bed[2]} mm
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Placa (curr_bed_type)</Label>
          <Select value={state.bed} onValueChange={(v) => onChange({ bed: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BED_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="center"
            checked={state.centerOnBed}
            onCheckedChange={(v) => onChange({ centerOnBed: !!v })}
          />
          <Label htmlFor="center" className="cursor-pointer">Centralizar no leito e apoiar no Z=0</Label>
        </div>
        {state.mesh && state.printer && (
          <>
            <div className="text-sm text-muted-foreground">
              Peça: {state.mesh.bbox.size.map((v) => v.toFixed(1)).join(" × ")} mm · Volume: {state.printer.bed.join(" × ")} mm
            </div>
            {!bedFits && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertTitle>Não cabe no leito</AlertTitle>
                <AlertDescription>Fatiar em partes menores ou reduzir a escala.</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StepMaterial({
  state, materials, openWarning, onChange,
}: {
  state: WizardState;
  materials: MaterialBase[];
  openWarning: boolean;
  onChange: (p: Partial<WizardState>) => void;
}) {
  const empty = materials.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Palette className="w-4 h-4" /> Material e cor</CardTitle>
        <CardDescription>
          {empty
            ? "Sincronizando catálogo…"
            : `${materials.length} materiais disponíveis para ${state.printer?.displayName ?? "esta impressora"}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Material</Label>
          <Select
            value={state.material?.id ?? ""}
            onValueChange={(id) => onChange({ material: materials.find((m) => m.id === id) ?? null })}
            disabled={empty}
          >
            <SelectTrigger><SelectValue placeholder={empty ? "Aguardando sincronização…" : "Selecione o material"} /></SelectTrigger>
            <SelectContent>
              {materials.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}{m.highFlow ? " · HF" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cor do filamento (obrigatória)</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={state.color}
              onChange={(e) => onChange({ color: e.target.value })}
              className="w-14 h-10 rounded border border-border cursor-pointer bg-transparent"
            />
            <Input
              value={state.color}
              onChange={(e) => onChange({ color: e.target.value })}
              placeholder="#F5C518"
              className="font-mono"
            />
          </div>
        </div>
        {state.material && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Bico {state.material.nozzle}°C · Mesa {state.material.bed}°C · Vol. máx {state.material.volSpeed} mm³/s</div>
            <div>Retração {state.material.retraction}mm · Fan {state.material.fanMin}–{state.material.fanMax}% (0 na 1ª camada)</div>
          </div>
        )}
        {openWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Cuidado com material técnico em impressora aberta</AlertTitle>
            <AlertDescription>
              {state.material?.label} em {state.printer?.printerModel} pode ter warping/delaminação.
              Considere usar caixa fechada ou trocar para PLA/PETG.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function StepPurpose({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Target className="w-4 h-4" /> Finalidade</CardTitle>
        <CardDescription>Define camada, paredes, preenchimento e velocidade.</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={state.purpose ?? ""} onValueChange={(v) => onChange({ purpose: v as Purpose })}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PURPOSES.map((p) => (
              <label
                key={p.id}
                htmlFor={p.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  state.purpose === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value={p.id} id={p.id} className="mt-1" />
                <div>
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

function StepAnalysis({
  state, analyzing, onRerun, onChange,
}: {
  state: WizardState; analyzing: boolean; onRerun: () => void;
  onChange: (p: Partial<WizardState>) => void;
}) {
  const a = state.analysis;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Scan className="w-4 h-4" /> Análise de suporte</CardTitle>
        <CardDescription>Raycast por face + comparação de orientações.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {analyzing && <div className="text-sm text-muted-foreground">Analisando 6 orientações...</div>}
        {!analyzing && a && (
          <>
            <div className={`rounded-lg p-3 border ${a.needsSupport ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40"}`}>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={a.needsSupport ? "destructive" : "secondary"}>
                  Suporte: {a.needsSupport ? "LIGADO" : "DESLIGADO"}
                </Badge>
                {a.needsSupport && (
                  <Badge variant="outline">Tipo: {a.suggestedType.toUpperCase()}</Badge>
                )}
                <Badge variant="outline">{(a.supportPct * 100).toFixed(1)}% da área</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{a.reason}</p>
            </div>

            <div className="space-y-2">
              <Label>Orientação (menor % de suporte vence)</Label>
              <div className="grid grid-cols-1 gap-1">
                {state.orientations.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => onChange({ chosenOrientationKey: o.key })}
                    className={`flex items-center justify-between text-sm p-2 rounded border transition-colors ${
                      state.chosenOrientationKey === o.key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    } ${!o.fits ? "opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      {o.label}
                      {!o.fits && <Badge variant="destructive" className="text-[10px]">não cabe</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {(o.analysis.supportPct * 100).toFixed(1)}% · h {o.heightMm.toFixed(0)}mm
                    </span>
                  </button>
                ))}
              </div>
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  const best = pickBestOrientation(state.orientations);
                  onChange({ chosenOrientationKey: best.key, analysis: best.analysis });
                }}
              >
                Aplicar orientação recomendada
              </Button>
            </div>

            <Separator />
            <div className="space-y-2">
              <Label>Sobrescrever</Label>
              <Tabs value={state.supportMode} onValueChange={(v) => onChange({ supportMode: v as WizardState["supportMode"] })}>
                <TabsList className="grid grid-cols-4">
                  <TabsTrigger value="auto">Auto</TabsTrigger>
                  <TabsTrigger value="normal">Normal</TabsTrigger>
                  <TabsTrigger value="tree">Tree</TabsTrigger>
                  <TabsTrigger value="off">Off</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {a.needsSupport && state.material && ["PLA", "PETG"].includes(state.material.filamentType) && (
              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Suporte em {state.material.filamentType} tende a soldar. A folga de topo foi ajustada
                  ({state.material.filamentType === "PETG" ? "0.25" : "0.20"}mm) para descolar.
                  Para pontos específicos, use <em>Support Painting</em> no Bambu Studio.
                </AlertDescription>
              </Alert>
            )}

            <Button variant="ghost" size="sm" onClick={onRerun}>
              <RefreshCw className="w-3 h-3 mr-2" /> Reanalizar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StepAdvanced({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  const setOv = (k: string, v: string | undefined) =>
    onChange({ overrides: { ...state.overrides, [k]: v } });

  const setIron = (patch: Partial<WizardState["ironing"]>) =>
    onChange({ ironing: { ...state.ironing, ...patch } });

  const effectiveType = state.ironing.type ?? (state.purpose === "decoracao" ? "top" : "no ironing");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sliders className="w-4 h-4" /> Avançado</CardTitle>
        <CardDescription>Overrides opcionais. Deixe em branco para usar os padrões do motor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="text-sm font-medium">Processo</CollapsibleTrigger>
          <CollapsibleContent className="grid grid-cols-2 gap-3 pt-3">
            {[
              ["layer_height", "Altura de camada (mm)"],
              ["wall_loops", "Nº de paredes"],
              ["sparse_infill_density", "Preenchimento (ex 15%)"],
              ["sparse_infill_pattern", "Padrão preenchimento"],
              ["wall_generator", "Gerador de parede (classic|arachne)"],
            ].map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  value={state.overrides[k] ?? ""}
                  placeholder="auto"
                  onChange={(e) => setOv(k, e.target.value || undefined)}
                />
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <Collapsible defaultOpen={state.purpose === "decoracao"}>
          <CollapsibleTrigger className="text-sm font-medium">
            Ironing (alisar topo){state.purpose === "decoracao" && <span className="ml-2 text-xs text-primary">recomendado</span>}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="space-y-1">
              <Label className="text-xs">Modo</Label>
              <Select
                value={effectiveType}
                onValueChange={(v) => setIron({ type: v as WizardState["ironing"]["type"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no ironing">Desligado</SelectItem>
                  <SelectItem value="top">Top (todas as superfícies de topo)</SelectItem>
                  <SelectItem value="topmost">Topmost (apenas última camada)</SelectItem>
                  <SelectItem value="solid">Solid (todas as camadas sólidas)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Alisa superfícies planas de topo, removendo linhas de camada. Ideal para peças de display.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fluxo</Label>
                <Input value={state.ironing.flow} onChange={(e) => setIron({ flow: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Spacing (mm)</Label>
                <Input value={state.ironing.spacing} onChange={(e) => setIron({ spacing: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Velocidade</Label>
                <Input value={state.ironing.speed} onChange={(e) => setIron({ speed: e.target.value })} />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {state.purpose === "decoracao" && (
          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle className="text-sm">Variable Layer Height é passo manual</AlertTitle>
            <AlertDescription className="text-xs">
              O perfil "Adaptive" depende da geometria e não é embarcado no .3mf.
              O relatório <code>_LEIA-ME.txt</code> gerado junto explica como
              aplicar em 30 segundos no Bambu Studio.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function StepGenerate({
  state, generating, genError, lastResult, onGenerate,
  validation, validating, onRevalidate, onSync, syncing,
}: {
  state: WizardState;
  generating: boolean;
  genError: string | null;
  lastResult: {
    url: string;
    fileName: string;
    summary: string;
    reportUrl: string;
    reportFileName: string;
  } | null;
  onGenerate: () => void;
  validation: ValidationReport | null;
  validating: boolean;
  onRevalidate: () => void;
  onSync: () => void;
  syncing: boolean;
}) {
  const effectiveIroning = state.ironing.type ?? (state.purpose === "decoracao" ? "top" : "no ironing");
  const canGenerate = !!validation?.ok && !generating && !validating;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Download className="w-4 h-4" /> Revisar e gerar</CardTitle>
        <CardDescription>Confira as validações antes de baixar o .3mf. Só liberamos o download se tudo estiver íntegro.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm space-y-1">
          <div><strong>Impressora:</strong> {state.printer?.displayName ?? "—"}</div>
          <div><strong>Material:</strong> {state.material?.label ?? "—"} · {state.color}</div>
          <div><strong>Finalidade:</strong> {state.purpose ?? "—"}</div>
          <div><strong>Suporte:</strong> {state.supportMode}</div>
          <div><strong>Ironing:</strong> {effectiveIroning}</div>
        </div>

        <ValidationSummary
          report={validation}
          loading={validating}
          onRevalidate={onRevalidate}
          onSync={onSync}
          syncing={syncing}
        />

        <div className="flex flex-wrap gap-2">
          <Button onClick={onGenerate} disabled={!canGenerate}>
            <Download className="w-4 h-4 mr-2" />
            {generating ? "Gerando..." : validating ? "Validando..." : "Gerar .3mf"}
          </Button>
          {!canGenerate && !validating && (
            <span className="text-xs text-muted-foreground self-center">
              {validation?.errors.length ? "Corrija os itens acima para liberar o download." : "Aguardando validação..."}
            </span>
          )}
        </div>


        {genError && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Não foi possível gerar</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap font-mono text-xs">
              {genError}
            </AlertDescription>
          </Alert>
        )}

        {lastResult && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm">
                <a href={lastResult.url} download={lastResult.fileName}>
                  <Download className="w-4 h-4 mr-2" /> Baixar .3mf
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={lastResult.reportUrl} download={lastResult.reportFileName}>
                  <Download className="w-4 h-4 mr-2" /> Baixar relatório (.txt)
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(lastResult.summary);
                  toast.success("Resumo copiado");
                }}
              >
                <Copy className="w-4 h-4 mr-2" /> Copiar resumo
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Arquivos: <span className="font-mono">{lastResult.fileName}</span> · <span className="font-mono">{lastResult.reportFileName}</span>
            </div>
            <ScrollArea className="h-40 w-full rounded border border-border p-2">
              <pre className="text-xs whitespace-pre-wrap font-mono">{lastResult.summary}</pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function HistoryCard({ history, onReuse }: { history: HistoryEntry[]; onReuse: (h: HistoryEntry) => void }) {
  if (history.length === 0) return null;
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2"><HistoryIcon className="w-4 h-4" /> Histórico</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-40">
          <div className="space-y-1">
            {history.slice(0, 20).map((h) => (
              <button
                key={h.id}
                onClick={() => onReuse(h)}
                className="w-full text-left text-xs p-2 rounded hover:bg-muted flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: h.color }} />
                  {h.outputFileName ?? h.fileName} · {h.materialId} · {h.purpose}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {new Date(h.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ValidationSummary({
  report, loading, onRevalidate, onSync, syncing,
}: {
  report: ValidationReport | null;
  loading: boolean;
  onRevalidate: () => void;
  onSync: () => void;
  syncing: boolean;
}) {
  if (loading && !report) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-sm text-muted-foreground flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Validando integridade do .3mf...
      </div>
    );
  }
  if (!report) return null;

  const dss = report.dssSlots;
  const dssOk = dss.length === 3;
  const keysOk = report.keyCount > 100;

  const Item = ({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) => (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          : <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {detail && <div className="text-xs text-muted-foreground break-words">{detail}</div>}
      </div>
    </li>
  );

  return (
    <div className={`rounded-2xl border p-3 space-y-3 ${report.ok ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {report.ok
            ? <><CheckCircle2 className="w-4 h-4 text-primary" /> Tudo pronto para gerar</>
            : <><AlertTriangle className="w-4 h-4 text-destructive" /> Validação encontrou problemas</>}
        </div>
        <Button size="sm" variant="ghost" onClick={onRevalidate} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Revalidar
        </Button>
      </div>

      <ul className="space-y-2">
        <Item
          ok={dssOk}
          label="different_settings_to_system na ordem [process, filament, printer]"
          detail={
            dssOk
              ? `process: ${dss.process.length} · filament: ${dss.filament.length} · printer: ${dss.printer.length}`
              : `Encontrado ${dss.length} slot(s) — esperado 3.`
          }
        />
        <Item
          ok={keysOk}
          label="Metadata/project_settings.config completo"
          detail={`${report.keyCount} chaves · mínimo 100 · linhagem: ${report.processLeaf ?? "—"} / ${report.filamentLeaf ?? "—"}`}
        />
        <Item
          ok={report.plateOk}
          label="Metadata/plate_1.json íntegro"
          detail={report.plateInfo ? `nozzle_diameter=${report.plateInfo.nozzle} · version=${report.plateInfo.version}` : "JSON ausente ou inválido."}
        />
        <Item
          ok={report.modelMetadataOk}
          label="3D/3dmodel.model reconhecido como projeto Bambu"
          detail="Application BambuStudio, BambuStudio:3mfVersion e build/item presentes."
        />
        <Item
          ok={report.modelSettingsOk}
          label="Metadata/model_settings.config vincula peça e placa"
          detail="object, part normal_part, plate e model_instance presentes."
        />
        <Item
          ok={report.sliceInfoOk}
          label="Metadata/slice_info.config consistente"
          detail="Cabeçalhos do slicer, impressora e bico conferidos."
        />
      </ul>

      {(dssOk && (dss.process.length > 0 || dss.filament.length > 0)) && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver chaves sobrescritas ({dss.process.length + dss.filament.length + dss.printer.length})
          </summary>
          <div className="mt-2 space-y-2 font-mono text-[11px]">
            {dss.process.length > 0 && (
              <div><span className="text-muted-foreground">process:</span> {dss.process.join(", ")}</div>
            )}
            {dss.filament.length > 0 && (
              <div><span className="text-muted-foreground">filament:</span> {dss.filament.join(", ")}</div>
            )}
            {dss.printer.length > 0 && (
              <div><span className="text-muted-foreground">printer:</span> {dss.printer.join(", ")}</div>
            )}
          </div>
        </details>
      )}

      {report.warnings.length > 0 && (
        <div className="text-xs text-muted-foreground flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            {report.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        </div>
      )}

      {report.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>Corrija antes de baixar</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              {report.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
            {report.needsSync && (
              <div className="mt-3">
                <Button size="sm" onClick={onSync} disabled={syncing}>
                  <Github className="w-4 h-4 mr-2" />
                  {syncing ? "Sincronizando..." : "Aprender com o GitHub e revalidar"}
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
