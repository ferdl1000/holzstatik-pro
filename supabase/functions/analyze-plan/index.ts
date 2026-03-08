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
    const { documentId, projectId } = await req.json();
    if (!documentId || !projectId) {
      return new Response(JSON.stringify({ error: "documentId und projectId erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY nicht konfiguriert");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: doc, error: docErr } = await supabase.from("documents").select("*").eq("id", documentId).single();
    if (docErr || !doc) throw new Error("Dokument nicht gefunden");

    await supabase.from("documents").update({ status: "processing" }).eq("id", documentId);

    const { data: fileData, error: fileErr } = await supabase.storage.from("plan-documents").download(doc.file_path);
    if (fileErr || !fileData) throw new Error("Datei-Download fehlgeschlagen");

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Concise system prompt – all output must be German, structured JSON only
    const systemPrompt = `Du bist ein Dokumenten-Agent für österreichische Einreichpläne (Baugenehmigungspläne).
Extrahiere aus dem PDF:
1. Texte (Kategorie: address|dimension|label|title|note) mit Konfidenz 0–1
2. Maße (Gebäudelänge/-breite, Dachneigung, Trauf-/Firsthöhe) mit Einheit und Konfidenz
3. Adressen: unterscheide Bauadresse von Planer-/Architektenadresse. Priorisiere Bauvorhaben/Bauplatz. Unterdrücke ZT/Ingenieurbüro.
4. Dachhinweise: Form, Neigung
5. Unsichere/unleserliche Bereiche benennen

Antworte NUR mit validem JSON:
{"texts":[{"content":"...","category":"...","confidence":0.9}],"dimensions":[{"value":12.5,"unit":"m","label":"Gebäudelänge","confidence":0.9}],"addresses":[{"fullAddress":"...","context":"...","isBuildingAddress":true,"confidence":0.88,"excludeReason":"..."}],"roofHints":{"form":"satteldach","pitch":35,"confidence":0.85},"overallConfidence":0.85,"unreliableAreas":["..."],"assumptions":["..."]}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
            { type: "text", text: `Analysiere: ${doc.file_name}` },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
          ]},
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte später erneut versuchen." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "KI-Guthaben aufgebraucht." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`KI-Analyse fehlgeschlagen: ${status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    let extracted: any;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      extracted = JSON.parse(jsonMatch[1]?.trim() || content.trim());
    } catch {
      console.error("KI-Antwort nicht parsebar:", content.slice(0, 300));
      extracted = { texts: [], dimensions: [], addresses: [], roofHints: null, overallConfidence: 0.3, unreliableAreas: ["KI-Antwort konnte nicht verarbeitet werden"], assumptions: [] };
    }

    await supabase.from("documents").update({ status: "analyzed", extracted_data: extracted }).eq("id", documentId);

    // Build project update
    const projectUpdate: any = {};

    const buildingAddr = extracted.addresses?.find((a: any) => a.isBuildingAddress);
    if (buildingAddr) {
      const parts = buildingAddr.fullAddress.split(",").map((s: string) => s.trim());
      const streetParts = parts[0]?.match(/^(.+?)\s+(\d+.*)$/) || [];
      const cityParts = parts[1]?.match(/^(\d{4})\s+(.+)$/) || [];
      projectUpdate.address = {
        street: streetParts[1] || parts[0] || "", houseNumber: streetParts[2] || "",
        postalCode: cityParts[1] || "", city: cityParts[2] || parts[1] || "",
        state: "", country: "Österreich", confidence: buildingAddr.confidence,
        source: "auto_extracted",
        alternatives: extracted.addresses?.map((a: any) => ({
          fullAddress: a.fullAddress, confidence: a.confidence, context: a.context,
          excluded: !a.isBuildingAddress, excludeReason: a.excludeReason || undefined,
        })) || [],
      };
    }

    if (extracted.dimensions?.length > 0) {
      const find = (label: string) => extracted.dimensions.find((d: any) => d.label?.toLowerCase().includes(label));
      const length = find("länge"); const width = find("breite"); const pitch = find("neigung");
      const eavesH = find("trauf"); const ridgeH = find("first");
      projectUpdate.geometry = {
        length: { value: length?.value || 0, unit: "m", confidence: length?.confidence || 0, source: "extracted" },
        width: { value: width?.value || 0, unit: "m", confidence: width?.confidence || 0, source: "extracted" },
        roofPitch: { value: pitch?.value || 0, unit: "°", confidence: pitch?.confidence || 0, source: "extracted" },
        eavesHeight: { value: eavesH?.value || 0, unit: "m", confidence: eavesH?.confidence || 0, source: "extracted" },
        ridgeHeight: { value: ridgeH?.value || 0, unit: "m", confidence: ridgeH?.confidence || 0, source: ridgeH ? "extracted" : "calculated" },
        spans: [], axes: [], isSymmetric: true, confidence: extracted.overallConfidence || 0.5, userConfirmed: false,
      };
    }

    if (extracted.roofHints) {
      projectUpdate.roofType = { form: extracted.roofHints.form || "satteldach", confidence: extracted.roofHints.confidence || 0.5, alternatives: [], userConfirmed: false };
    }

    // Audit log
    const auditEntries: any[] = [{
      project_id: projectId, agent: "Dokumenten-Agent",
      action: `PDF analysiert: ${doc.file_name}`, field: "documents",
      reason: `Konfidenz ${(extracted.overallConfidence * 100).toFixed(0)}%`,
      new_value: `${extracted.texts?.length || 0} Texte, ${extracted.dimensions?.length || 0} Maße`, user_initiated: true,
    }];
    if (buildingAddr) {
      auditEntries.push({ project_id: projectId, agent: "Adress-Agent", action: "Bauadresse erkannt", field: "address", reason: buildingAddr.context, new_value: buildingAddr.fullAddress, user_initiated: false });
    }
    await supabase.from("audit_log").insert(auditEntries);

    // Merge into project_data
    const { data: currentProject } = await supabase.from("projects").select("project_data").eq("id", projectId).single();
    if (currentProject) {
      const current = currentProject.project_data as any;
      const merged = { ...current, ...projectUpdate };
      if (merged.documents?.[0]) {
        merged.documents[0].extractedData = {
          texts: extracted.texts?.map((t: any) => ({ content: t.content, position: { x: 0, y: 0, width: 200, height: 15 }, confidence: t.confidence, category: t.category })) || [],
          dimensions: extracted.dimensions || [], symbols: [], confidence: extracted.overallConfidence || 0.5,
        };
        merged.documents[0].status = "analyzed";
      }
      await supabase.from("projects").update({ project_data: merged, current_step: Math.max(current.currentStep || 1, 2) }).eq("id", projectId);
    }

    return new Response(JSON.stringify({ success: true, extracted, projectUpdate }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
