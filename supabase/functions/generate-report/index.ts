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
      return new Response(JSON.stringify({ error: "projectId and reportType required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load project
    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (error || !project) throw new Error("Project not found");

    const pd = project.project_data as any;

    // Load audit log
    const { data: auditLogs } = await supabase
      .from("audit_log")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    // Build report content based on type
    let prompt = "";
    let title = "";

    switch (reportType) {
      case "statik":
        title = "Statik-Auszug";
        prompt = buildStatikPrompt(pd, auditLogs || []);
        break;
      case "holzliste":
        title = "Holzliste / Holzauszug";
        prompt = buildHolzlistePrompt(pd);
        break;
      case "pruefprotokoll":
        title = "Prüfprotokoll";
        prompt = buildPruefprotokollPrompt(pd, auditLogs || []);
        break;
      case "projektdoku":
        title = "Projektdokumentation";
        prompt = buildProjektdokuPrompt(pd, auditLogs || []);
        break;
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    const systemPrompt = `Du bist ein Bericht-Agent für eine österreichische Holzbau-Vorbemessungssoftware.
Erstelle einen professionellen, technischen Bericht auf Deutsch.

WICHTIGE REGELN:
- Alle automatisch angenommenen Werte mit [AUTO] markieren
- Alle vom Benutzer bestätigten Werte mit [BESTÄTIGT] markieren
- Alle unbestätigten Werte mit [UNBESTÄTIGT] markieren
- Am Ende immer den Hinweis: "Diese Vorbemessung ersetzt keine rechtsverbindliche statische Berechnung durch eine qualifizierte Fachperson."
- Formatiere als strukturiertes HTML für PDF-Ausgabe
- Verwende professionelle Tabellen für Zahlenwerte
- Gib den Prüfstatus als Ampel an (Rot/Gelb/Grün)

Erstelle den Bericht im HTML-Format mit inline CSS für eine professionelle PDF-Darstellung.
Verwende die Schriftart "IBM Plex Sans" und monospace für Zahlen.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit. Bitte später erneut versuchen." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI-Guthaben aufgebraucht." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      throw new Error(`AI error: ${errText}`);
    }

    const aiResult = await aiResponse.json();
    const htmlContent = aiResult.choices?.[0]?.message?.content || "";

    // Extract HTML from markdown code blocks if wrapped
    const htmlMatch = htmlContent.match(/```(?:html)?\s*([\s\S]*?)```/);
    const cleanHtml = htmlMatch ? htmlMatch[1].trim() : htmlContent;

    // Log report generation
    await supabase.from("audit_log").insert({
      project_id: projectId,
      agent: "Bericht-Agent",
      action: `${title} generiert`,
      field: "report",
      reason: `Berichtstyp: ${reportType}`,
      user_initiated: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        title,
        html: cleanHtml,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildStatikPrompt(pd: any, auditLogs: any[]): string {
  return `Erstelle einen STATIK-AUSZUG für folgendes Projekt:

PROJEKTDATEN:
- Name: ${pd.name || "-"}
- Beschreibung: ${pd.description || "-"}
- Adresse: ${pd.address?.street || ""} ${pd.address?.houseNumber || ""}, ${pd.address?.postalCode || ""} ${pd.address?.city || ""}
- Adresse bestätigt: ${pd.address?.source === "user_confirmed" ? "Ja" : "Nein"}

GEOMETRIE:
- Gebäudelänge: ${pd.geometry?.length?.value || "-"} m (Konfidenz: ${((pd.geometry?.length?.confidence || 0) * 100).toFixed(0)}%)
- Gebäudebreite: ${pd.geometry?.width?.value || "-"} m
- Dachneigung: ${pd.geometry?.roofPitch?.value || "-"}°
- Traufhöhe: ${pd.geometry?.eavesHeight?.value || "-"} m
- Firsthöhe: ${pd.geometry?.ridgeHeight?.value || "-"} m
- Geometrie bestätigt: ${pd.geometry?.userConfirmed ? "Ja" : "Nein"}

DACHFORM: ${pd.roofType?.form || "-"} (Konfidenz: ${((pd.roofType?.confidence || 0) * 100).toFixed(0)}%)
TRAGWERK: ${pd.structuralSystem?.type || "-"} (Konfidenz: ${((pd.structuralSystem?.confidence || 0) * 100).toFixed(0)}%)
Begründung: ${pd.structuralSystem?.reasoning || "-"}

LASTANNAHMEN:
${(pd.loadCases || []).map((lc: any) => `- ${lc.name}: ${lc.value} ${lc.unit} (${lc.source}) ${lc.userModified ? "[BESTÄTIGT]" : "[AUTO]"}`).join("\n")}

BAUTEILE:
${(pd.members || []).map((m: any) => `- ${m.name}: ${m.crossSection} mm, Länge ${m.length} m, Anzahl ${m.quantity}`).join("\n")}

BEMESSUNGSERGEBNISSE:
${(pd.calculations || []).map((c: any) => `${c.memberName} (Status: ${c.overallStatus}):
${c.checks.map((ch: any) => `  - ${ch.name}: ${ch.result}/${ch.limit} ${ch.unit} → ${ch.status} ${ch.formula ? `(${ch.formula})` : ""}`).join("\n")}
  Offene Punkte: ${c.missingInputs.join(", ") || "keine"}`).join("\n\n")}

Erstelle einen vollständigen Statik-Auszug mit allen Nachweisen, Formeln und Ergebnissen.`;
}

function buildHolzlistePrompt(pd: any): string {
  return `Erstelle eine HOLZLISTE / HOLZAUSZUG für folgendes Projekt:

PROJEKT: ${pd.name || "-"}

MATERIALIEN:
${(pd.materials || []).map((m: any) => `- ${m.name} (${m.type}): FK ${m.strengthClass}, E=${m.elasticModulus} N/mm², fm,k=${m.bendingStrength} N/mm²`).join("\n")}

BAUTEILE:
${(pd.members || []).map((m: any) => {
  const mat = (pd.materials || []).find((mt: any) => mt.id === m.material);
  return `- ${m.name}: ${m.width}/${m.height} mm, L=${m.length} m, Anzahl=${m.quantity}, Material: ${mat?.name || "-"}`;
}).join("\n")}

Erstelle eine tabellarische Holzliste mit:
1. Positionsnummer
2. Bauteilbezeichnung
3. Querschnitt b/h (mm)
4. Länge (m)
5. Stückzahl
6. Volumen (m³)
7. Material/Festigkeitsklasse
8. Gesamtvolumen
9. Zusammenfassung Holzbedarf nach Material`;
}

function buildPruefprotokollPrompt(pd: any, auditLogs: any[]): string {
  return `Erstelle ein PRÜFPROTOKOLL für folgendes Projekt:

PROJEKT: ${pd.name || "-"}

VALIDIERUNGSERGEBNISSE:
${(pd.validationIssues || []).map((v: any) => `- [${v.severity.toUpperCase()}] ${v.category}: ${v.message}${v.suggestion ? ` → Empfehlung: ${v.suggestion}` : ""}${v.resolved ? " [ERLEDIGT]" : ""}`).join("\n")}

AUDIT TRAIL:
${auditLogs.map((a: any) => `- ${new Date(a.created_at).toLocaleString("de-AT")}: ${a.agent} - ${a.action}${a.reason ? ` (${a.reason})` : ""}${a.new_value ? ` → ${a.new_value}` : ""}`).join("\n")}

OFFENE PUNKTE:
${(pd.calculations || []).flatMap((c: any) => c.missingInputs.map((mi: string) => `- ${c.memberName}: ${mi}`)).join("\n") || "Keine"}

Erstelle ein detailliertes Prüfprotokoll mit:
1. Zusammenfassung Prüfstatus (Ampel)
2. Alle Prüfschritte mit Ergebnis
3. Widerspruchsliste
4. Offene Punkte
5. Freigabestatus
6. Audit Trail aller automatischen und manuellen Änderungen
7. Haftungshinweis`;
}

function buildProjektdokuPrompt(pd: any, auditLogs: any[]): string {
  return `Erstelle eine VOLLSTÄNDIGE PROJEKTDOKUMENTATION für:

PROJEKT: ${pd.name || "-"}
BESCHREIBUNG: ${pd.description || "-"}
ADRESSE: ${pd.address?.street || ""} ${pd.address?.houseNumber || ""}, ${pd.address?.postalCode || ""} ${pd.address?.city || ""}

Beinhalte alle Abschnitte:
1. Projektdatenblatt
2. Extrahierte Planinformationen (${(pd.documents || []).length} Dokumente)
3. Verwendete Bauadresse (Quelle: ${pd.address?.source || "-"})
4. Lastannahmen Österreich (${(pd.loadCases || []).length} Lastfälle)
5. Dachsystem: ${pd.roofType?.form || "-"} / ${pd.structuralSystem?.type || "-"}
6. Bauteilliste (${(pd.members || []).length} Bauteile)
7. Materialliste (${(pd.materials || []).length} Materialien)
8. Bemessungsergebnisse (${(pd.calculations || []).length} Berechnungen)
9. Offene Punkte (${(pd.validationIssues || []).filter((v: any) => !v.resolved).length} offene Issues)
10. Prüfprotokoll / Audit Trail (${auditLogs.length} Einträge)

GEOMETRIE: ${pd.geometry?.length?.value || "-"} x ${pd.geometry?.width?.value || "-"} m, DN ${pd.geometry?.roofPitch?.value || "-"}°

LASTFÄLLE:
${(pd.loadCases || []).map((lc: any) => `- ${lc.name}: ${lc.value} ${lc.unit}`).join("\n")}

BAUTEILE:
${(pd.members || []).map((m: any) => `- ${m.name}: ${m.crossSection} mm, L=${m.length} m, n=${m.quantity}`).join("\n")}

BEMESSUNG:
${(pd.calculations || []).map((c: any) => `- ${c.memberName}: ${c.overallStatus}`).join("\n")}

VALIDIERUNG:
${(pd.validationIssues || []).map((v: any) => `- [${v.severity}] ${v.message}`).join("\n")}

Erstelle eine vollständige, druckfähige Projektdokumentation.`;
}
