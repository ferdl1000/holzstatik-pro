import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiText, CORS_HEADERS } from "../_shared/gemini.ts";

const corsHeaders = CORS_HEADERS;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, reportType } = await req.json();
    if (!projectId || !reportType) {
      return new Response(JSON.stringify({ error: "projectId und reportType erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Denselben Gemini-Key wie alle anderen Agenten nutzen (Admin: GOOGLE_AI_API_KEY,
    // Fallback GEMINI_API_KEY) — kein separater/bezahlter Lovable-Gateway-Key mehr nötig.
    let geminiApiKey: string | undefined;
    try {
      const { data: ks } = await supabase.from("system_settings").select("key,value")
        .in("key", ["GOOGLE_AI_API_KEY", "GEMINI_API_KEY"]);
      const found = (ks || []).find((r: any) => typeof r.value === "string" && r.value.trim().length > 20);
      if (found) geminiApiKey = found.value.trim();
    } catch { /* Env-Secret-Fallback in geminiText() */ }

    const { data: project, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (error || !project) throw new Error("Projekt nicht gefunden");

    const pd = project.project_data as any;
    const { data: auditLogs } = await supabase.from("audit_log").select("*").eq("project_id", projectId).order("created_at", { ascending: true });

    let title = "";
    let dataPrompt = "";

    switch (reportType) {
      case "statik": title = "Statik-Auszug"; dataPrompt = buildStatik(pd, auditLogs || []); break;
      case "holzliste": title = "Holzliste / Holzauszug"; dataPrompt = buildHolzliste(pd); break;
      case "pruefprotokoll": title = "Prüfprotokoll"; dataPrompt = buildPruef(pd, auditLogs || []); break;
      case "projektdoku": title = "Projektdokumentation"; dataPrompt = buildDoku(pd, auditLogs || []); break;
      default: throw new Error(`Unbekannter Berichtstyp: ${reportType}`);
    }

    const systemPrompt = `Erstelle einen professionellen deutschen Fachbericht (HTML mit inline CSS, Schrift IBM Plex Sans/Mono).
Regeln: Automatische Werte mit [AUTO], bestätigte mit [BESTÄTIGT], unbestätigte mit [UNBESTÄTIGT] markieren.
Ampel-Farbcodes: Rot=#ef4444, Gelb=#f59e0b, Grün=#22c55e.
Am Ende: „Diese Vorbemessung ersetzt keine rechtsverbindliche statische Berechnung durch eine qualifizierte Fachperson."`;

    let htmlContent: string;
    try {
      htmlContent = await geminiText({
        systemPrompt, userPrompt: `Erstelle: ${title}\n\n${dataPrompt}`,
        apiKey: geminiApiKey, temperature: 0.3, maxTokens: 8192,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isQuota = msg.includes("429") || /quota/i.test(msg);
      return new Response(JSON.stringify({
        error: isQuota
          ? "Gemini-Tageslimit erreicht. Bitte später erneut versuchen oder eigenen Key im Admin hinterlegen."
          : `KI-Fehler: ${msg}`,
      }), { status: isQuota ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const htmlMatch = htmlContent.match(/```(?:html)?\s*([\s\S]*?)```/);
    const cleanHtml = htmlMatch ? htmlMatch[1].trim() : htmlContent;

    await supabase.from("audit_log").insert({ project_id: projectId, agent: "Bericht-Agent", action: `${title} generiert`, field: "report", reason: `Typ: ${reportType}`, user_initiated: true });

    return new Response(JSON.stringify({ success: true, title, html: cleanHtml, generatedAt: new Date().toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function buildStatik(pd: any, logs: any[]): string {
  return `PROJEKT: ${pd.name || "-"} | Adresse: ${pd.address?.street || ""} ${pd.address?.houseNumber || ""}, ${pd.address?.postalCode || ""} ${pd.address?.city || ""} (${pd.address?.source === "user_confirmed" ? "BESTÄTIGT" : "UNBESTÄTIGT"})
GEOMETRIE: ${pd.geometry?.length?.value || "-"}×${pd.geometry?.width?.value || "-"} m, DN ${pd.geometry?.roofPitch?.value || "-"}°, TH ${pd.geometry?.eavesHeight?.value || "-"} m, FH ${pd.geometry?.ridgeHeight?.value || "-"} m (${pd.geometry?.userConfirmed ? "BESTÄTIGT" : "UNBESTÄTIGT"})
DACH: ${pd.roofType?.form || "-"} | TRAGWERK: ${pd.structuralSystem?.type || "-"}
LASTEN:\n${(pd.loadCases || []).map((l: any) => `${l.name}: ${l.value} ${l.unit} (${l.userModified ? "BESTÄTIGT" : "AUTO"}) – ${l.source}`).join("\n")}
BAUTEILE:\n${(pd.members || []).map((m: any) => `${m.name}: ${m.crossSection} mm, L=${m.length} m, n=${m.quantity}`).join("\n")}
BEMESSUNG:\n${(pd.calculations || []).map((c: any) => `${c.memberName} [${c.overallStatus}]: ${c.checks.map((ch: any) => `${ch.name}=${ch.result}/${ch.limit} ${ch.status}`).join(", ")}`).join("\n")}`;
}

function buildHolzliste(pd: any): string {
  return `PROJEKT: ${pd.name || "-"}\nMATERIALIEN:\n${(pd.materials || []).map((m: any) => `${m.name} (${m.strengthClass})`).join(", ")}
BAUTEILE:\n${(pd.members || []).map((m: any) => {
  const vol = ((m.width || 0) / 1000) * ((m.height || 0) / 1000) * (m.length || 0) * (m.quantity || 0);
  return `${m.name}: ${m.width}/${m.height} mm, L=${m.length} m, n=${m.quantity}, V=${vol.toFixed(3)} m³`;
}).join("\n")}
Erstelle tabellarische Holzliste mit Pos.-Nr., Bauteil, Querschnitt, Länge, Stückzahl, Volumen, Material, Gesamtvolumen.`;
}

function buildPruef(pd: any, logs: any[]): string {
  return `PROJEKT: ${pd.name || "-"}
VALIDIERUNG:\n${(pd.validationIssues || []).map((v: any) => `[${v.severity}] ${v.category}: ${v.message}${v.resolved ? " [ERLEDIGT]" : ""}`).join("\n")}
AUDIT (${logs.length} Einträge):\n${logs.slice(-20).map((a: any) => `${a.agent}: ${a.action}`).join("\n")}`;
}

function buildDoku(pd: any, logs: any[]): string {
  return `PROJEKT: ${pd.name || "-"} – ${pd.description || "-"}
ADRESSE: ${pd.address?.street || ""} ${pd.address?.houseNumber || ""}, ${pd.address?.postalCode || ""} ${pd.address?.city || ""}
GEOMETRIE: ${pd.geometry?.length?.value || "-"}×${pd.geometry?.width?.value || "-"} m
DACH: ${pd.roofType?.form || "-"} / ${pd.structuralSystem?.type || "-"}
LASTEN: ${(pd.loadCases || []).length} Fälle | BAUTEILE: ${(pd.members || []).length} | BEMESSUNGEN: ${(pd.calculations || []).length}
OFFENE ISSUES: ${(pd.validationIssues || []).filter((v: any) => !v.resolved).length}
AUDIT: ${logs.length} Einträge
Erstelle vollständige druckfähige Projektdokumentation mit allen Abschnitten.`;
}
