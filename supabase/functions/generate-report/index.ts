import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, reportType } = await req.json();
    if (!projectId || !reportType) {
      return new Response(JSON.stringify({ error: "projectId und reportType erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY nicht konfiguriert");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Erstelle: ${title}\n\n${dataPrompt}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const s = aiResponse.status;
      if (s === 429) return new Response(JSON.stringify({ error: "Rate-Limit. Bitte später erneut versuchen." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (s === 402) return new Response(JSON.stringify({ error: "KI-Guthaben aufgebraucht." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`KI-Fehler: ${s}`);
    }

    const aiResult = await aiResponse.json();
    const htmlContent = aiResult.choices?.[0]?.message?.content || "";
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
