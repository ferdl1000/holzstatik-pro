import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { Bot, Type, Ruler, Tag } from 'lucide-react';

interface ExtractionTabProps { project: Project; }

export function ExtractionTab({ project }: ExtractionTabProps) {
  const extraction = project.documents[0]?.extractedData;

  if (!extraction) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-muted-foreground">Kein Dokument analysiert</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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
          {/* Extracted texts */}
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

          {/* Extracted dimensions */}
          <div>
            <h4 className="section-header flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" /> Erkannte Maße</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Wert</th>
                  <th>Einheit</th>
                  <th>Konfidenz</th>
                  <th>Quelle</th>
                </tr>
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
    </div>
  );
}
