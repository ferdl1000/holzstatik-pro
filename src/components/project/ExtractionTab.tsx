import { useState, useEffect } from 'react';
import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Bot, Type, Ruler, Tag, AlertTriangle, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ExtractionTabProps { project: Project; projectId?: string; }

export function ExtractionTab({ project, projectId }: ExtractionTabProps) {
  const [dbExtraction, setDbExtraction] = useState<any>(null);

  useEffect(() => {
    if (projectId) loadDbExtraction();
  }, [projectId]);

  async function loadDbExtraction() {
    const { data } = await supabase
      .from('documents')
      .select('extracted_data, status')
      .eq('project_id', projectId!)
      .limit(1);
    if (data?.[0]?.extracted_data) {
      setDbExtraction(data[0].extracted_data);
    }
  }

  const extraction = project.documents[0]?.extractedData;
  const aiData = dbExtraction;

  if (!extraction && !aiData) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64 space-y-3">
        <Database className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-muted-foreground">Kein Dokument analysiert</p>
        <p className="text-xs text-muted-foreground">Laden Sie zuerst einen Plan hoch und starten Sie die KI-Analyse.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* AI extraction results from DB */}
      {aiData && (
        <SectionCard
          title="KI-Analyseergebnis"
          subtitle="Rohdaten der automatischen Plananalyse"
          headerRight={
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-agent-document" />
              <span className="text-xs text-muted-foreground">KI-Konfidenz:</span>
              <ConfidenceBadge confidence={aiData.overallConfidence || 0.5} size="md" />
            </div>
          }
        >
          <div className="space-y-6">
            {/* Unreliable areas warning */}
            {aiData.unreliableAreas?.length > 0 && (
              <div className="rounded-md bg-status-yellow-bg border border-status-yellow/20 p-3">
                <p className="text-xs font-medium text-status-yellow mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />Unleserliche / unsichere Bereiche
                </p>
                <ul className="text-xs text-foreground/70 space-y-0.5">
                  {aiData.unreliableAreas.map((area: string, i: number) => (
                    <li key={i}>• {area}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Addresses from AI */}
            {aiData.addresses?.length > 0 && (
              <div>
                <h4 className="section-header flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Erkannte Adressen</h4>
                <div className="space-y-2">
                  {aiData.addresses.map((addr: any, i: number) => (
                    <div key={i} className={`flex items-center justify-between rounded-md border p-3 ${addr.isBuildingAddress ? 'bg-status-green-bg/30 border-status-green/20' : 'bg-muted/20'}`}>
                      <div>
                        <p className="text-sm font-medium">{addr.fullAddress}</p>
                        <p className="text-xs text-muted-foreground">{addr.context}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ConfidenceBadge confidence={addr.confidence} />
                        {addr.isBuildingAddress ? (
                          <span className="status-badge-green text-[10px] px-1.5 py-0.5 rounded font-medium">Bauadresse</span>
                        ) : (
                          <span className="status-badge-red text-[10px] px-1.5 py-0.5 rounded font-medium">{addr.excludeReason || 'Ausgeschlossen'}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Texts */}
            {aiData.texts?.length > 0 && (
              <div>
                <h4 className="section-header flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Erkannte Texte ({aiData.texts.length})</h4>
                <div className="space-y-2">
                  {aiData.texts.map((text: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded-md border p-3 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{text.category}</span>
                        <span className="text-sm">{text.content}</span>
                      </div>
                      <ConfidenceBadge confidence={text.confidence} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Dimensions */}
            {aiData.dimensions?.length > 0 && (
              <div>
                <h4 className="section-header flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" /> Erkannte Maße ({aiData.dimensions.length})</h4>
                <table className="data-table">
                  <thead>
                    <tr><th>Bezeichnung</th><th>Wert</th><th>Einheit</th><th>Konfidenz</th></tr>
                  </thead>
                  <tbody>
                    {aiData.dimensions.map((dim: any, i: number) => (
                      <tr key={i}>
                        <td className="font-medium text-sm">{dim.label || '-'}</td>
                        <td className="value-display">{dim.value}</td>
                        <td className="text-muted-foreground">{dim.unit}</td>
                        <td><ConfidenceBadge confidence={dim.confidence} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Roof hints */}
            {aiData.roofHints && (
              <div>
                <h4 className="section-header">Dachhinweise</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-muted/50 p-3">
                    <span className="text-[10px] text-muted-foreground">Erkannte Dachform</span>
                    <p className="text-sm font-medium mt-0.5 capitalize">{aiData.roofHints.form || '-'}</p>
                  </div>
                  {aiData.roofHints.pitch && (
                    <div className="rounded-md bg-muted/50 p-3">
                      <span className="text-[10px] text-muted-foreground">Dachneigung</span>
                      <p className="text-sm font-mono font-medium mt-0.5">{aiData.roofHints.pitch}°</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assumptions */}
            {aiData.assumptions?.length > 0 && (
              <div className="rounded-md bg-muted/20 p-3">
                <h4 className="text-xs font-medium mb-1.5">Getroffene Annahmen</h4>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {aiData.assumptions.map((a: string, i: number) => (
                    <li key={i}>• {a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Fallback: Mock extraction data */}
      {extraction && !aiData && (
        <SectionCard
          title="Extrahierte Daten"
          subtitle="Vom Dokumenten-Agent automatisch erkannt"
          headerRight={
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-agent-document" />
              <span className="text-xs text-muted-foreground">Gesamt-Konfidenz:</span>
              <ConfidenceBadge confidence={extraction.confidence} size="md" />
            </div>
          }
        >
          <div className="space-y-6">
            <div>
              <h4 className="section-header flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Erkannte Texte</h4>
              <div className="space-y-2">
                {extraction.texts.map((text, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border p-3 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{text.category}</span>
                      <span className="text-sm">{text.content}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <SourceTag source="extracted" />
                      <ConfidenceBadge confidence={text.confidence} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="section-header flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" /> Erkannte Maße</h4>
              <table className="data-table">
                <thead>
                  <tr><th>Bezeichnung</th><th>Wert</th><th>Einheit</th><th>Konfidenz</th><th>Quelle</th></tr>
                </thead>
                <tbody>
                  {extraction.dimensions.map((dim, i) => (
                    <tr key={i}>
                      <td className="font-medium text-sm">{dim.label || '-'}</td>
                      <td className="value-display">{dim.value}</td>
                      <td className="text-muted-foreground">{dim.unit}</td>
                      <td><ConfidenceBadge confidence={dim.confidence} /></td>
                      <td><SourceTag source="extracted" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
