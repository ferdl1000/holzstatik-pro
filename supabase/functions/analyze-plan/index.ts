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
      return new Response(JSON.stringify({ error: "documentId and projectId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get document record
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) throw new Error("Document not found");

    // Update status to processing
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    // Download the file from storage
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("plan-documents")
      .download(doc.file_path);
    if (fileErr || !fileData) throw new Error("File download failed");

    // Convert to base64 for AI analysis
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Use Lovable AI to analyze the plan
    const systemPrompt = `Du bist ein spezialisierter Dokumenten-Agent für österreichische Einreichpläne.

Analysiere das hochgeladene PDF-Dokument und extrahiere folgende Informationen:

1. **Texte**: Alle erkannten Textblöcke mit Kategorie (address, dimension, label, title, note)
2. **Maße**: Gebäudelänge, -breite, Dachneigung, Traufhöhe, Firsthöhe, Spannweiten
3. **Adressen**: Unterscheide Bauadresse von Planer-/Architektenadresse
   - Priorisiere: Bauort, Bauplatz, Grundstück, Objektadresse
   - Unterdrücke: Planverfasser, Architekt, ZT, Ingenieurbüro, Firmenstempel
4. **Dachhinweise**: Dachform, Dachneigung, Dachaufbau
5. **Symbole**: Maßketten, Achsen, Schnittlinien

Für jeden extrahierten Wert gib eine Konfidenz (0-1) an.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt im folgenden Format:
{
  "texts": [{"content": "...", "category": "address|dimension|label|title|note", "confidence": 0.95}],
  "dimensions": [{"value": 12.5, "unit": "m", "label": "Gebäudelänge", "confidence": 0.9}],
  "addresses": [
    {"fullAddress": "...", "context": "Nähe Bauvorhaben-Label", "isBuildingAddress": true, "confidence": 0.88},
    {"fullAddress": "...", "context": "Planverfasser-Stempel", "isBuildingAddress": false, "excludeReason": "Architekturbüro", "confidence": 0.92}
  ],
  "roofHints": {"form": "satteldach|pultdach|walmdach|krueppelwalmdach|flachdach", "pitch": 35, "confidence": 0.85},
  "overallConfidence": 0.85,
  "unreliableAreas": ["Beschreibung unleserlicher Bereiche"],
  "assumptions": ["Liste getroffener Annahmen"]
}`;

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
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analysiere diesen österreichischen Einreichplan. Dateiname: ${doc.file_name}. Extrahiere alle relevanten Gebäudedaten, Adressen, Maße und Dachhinweise.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte versuchen Sie es später erneut." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI-Guthaben aufgebraucht." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse AI response - extract JSON from potential markdown code blocks
    let extracted: any;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      extracted = JSON.parse(jsonMatch[1]?.trim() || content.trim());
    } catch {
      console.error("Failed to parse AI response:", content);
      extracted = {
        texts: [],
        dimensions: [],
        addresses: [],
        roofHints: null,
        overallConfidence: 0.3,
        unreliableAreas: ["KI-Antwort konnte nicht verarbeitet werden"],
        assumptions: [],
      };
    }

    // Update document with extracted data
    await supabase
      .from("documents")
      .update({
        status: "analyzed",
        extracted_data: extracted,
      })
      .eq("id", documentId);

    // Build project update from extracted data
    const projectUpdate: any = {};

    // Build address from best candidate
    const buildingAddr = extracted.addresses?.find((a: any) => a.isBuildingAddress);
    if (buildingAddr) {
      // Simple address parsing for Austrian addresses
      const parts = buildingAddr.fullAddress.split(",").map((s: string) => s.trim());
      const streetParts = parts[0]?.match(/^(.+?)\s+(\d+.*)$/) || [];
      const cityParts = parts[1]?.match(/^(\d{4})\s+(.+)$/) || [];

      projectUpdate.address = {
        street: streetParts[1] || parts[0] || "",
        houseNumber: streetParts[2] || "",
        postalCode: cityParts[1] || "",
        city: cityParts[2] || parts[1] || "",
        state: "",
        country: "Österreich",
        confidence: buildingAddr.confidence,
        source: "auto_extracted",
        alternatives: extracted.addresses?.map((a: any) => ({
          fullAddress: a.fullAddress,
          confidence: a.confidence,
          context: a.context,
          excluded: !a.isBuildingAddress,
          excludeReason: a.excludeReason || undefined,
        })) || [],
      };
    }

    // Build geometry from dimensions
    if (extracted.dimensions?.length > 0) {
      const findDim = (label: string) =>
        extracted.dimensions.find((d: any) =>
          d.label?.toLowerCase().includes(label.toLowerCase())
        );

      const length = findDim("länge") || findDim("length");
      const width = findDim("breite") || findDim("width");
      const pitch = findDim("neigung") || findDim("pitch");
      const eavesH = findDim("trauf");
      const ridgeH = findDim("first");

      projectUpdate.geometry = {
        length: { value: length?.value || 0, unit: "m", confidence: length?.confidence || 0, source: "extracted" },
        width: { value: width?.value || 0, unit: "m", confidence: width?.confidence || 0, source: "extracted" },
        roofPitch: { value: pitch?.value || 0, unit: "°", confidence: pitch?.confidence || 0, source: "extracted" },
        eavesHeight: { value: eavesH?.value || 0, unit: "m", confidence: eavesH?.confidence || 0, source: "extracted" },
        ridgeHeight: { value: ridgeH?.value || 0, unit: "m", confidence: ridgeH?.confidence || 0, source: ridgeH ? "extracted" : "calculated" },
        spans: [],
        axes: [],
        isSymmetric: true,
        confidence: extracted.overallConfidence || 0.5,
        userConfirmed: false,
      };
    }

    // Build roof type
    if (extracted.roofHints) {
      projectUpdate.roofType = {
        form: extracted.roofHints.form || "satteldach",
        confidence: extracted.roofHints.confidence || 0.5,
        alternatives: [],
        userConfirmed: false,
      };
    }

    // Write audit log
    const auditEntries = [
      {
        project_id: projectId,
        agent: "Dokumenten-Agent",
        action: `PDF analysiert: ${doc.file_name}`,
        field: "documents",
        reason: `KI-Analyse mit Konfidenz ${(extracted.overallConfidence * 100).toFixed(0)}%`,
        new_value: `${extracted.texts?.length || 0} Texte, ${extracted.dimensions?.length || 0} Maße erkannt`,
        user_initiated: true,
      },
    ];

    if (buildingAddr) {
      auditEntries.push({
        project_id: projectId,
        agent: "Adress-Agent",
        action: "Bauadresse erkannt",
        field: "address",
        reason: `Textblock: ${buildingAddr.context}`,
        new_value: buildingAddr.fullAddress,
        user_initiated: false,
      });
    }

    await supabase.from("audit_log").insert(auditEntries);

    // Update project data
    const { data: currentProject } = await supabase
      .from("projects")
      .select("project_data")
      .eq("id", projectId)
      .single();

    if (currentProject) {
      const currentData = currentProject.project_data as any;
      const mergedData = { ...currentData, ...projectUpdate };

      // Update extracted data in documents array
      if (mergedData.documents?.[0]) {
        mergedData.documents[0].extractedData = {
          texts: extracted.texts?.map((t: any) => ({
            content: t.content,
            position: { x: 0, y: 0, width: 200, height: 15 },
            confidence: t.confidence,
            category: t.category,
          })) || [],
          dimensions: extracted.dimensions || [],
          symbols: [],
          confidence: extracted.overallConfidence || 0.5,
        };
        mergedData.documents[0].status = "analyzed";
      }

      await supabase
        .from("projects")
        .update({ project_data: mergedData, current_step: Math.max(currentData.currentStep || 1, 2) })
        .eq("id", projectId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        extracted,
        projectUpdate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
