import type { Project } from '@/types/project';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { SourceTag } from '@/components/shared/SourceTag';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { MapPin, Check, X, Edit, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddressTabProps { project: Project; }

export function AddressTab({ project }: AddressTabProps) {
  const addr = project.address;

  if (!addr) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-muted-foreground">Keine Adresse erkannt – bitte manuell eingeben</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SectionCard
        title="Bauadresse"
        subtitle="Erkannt durch den Adress-Agent"
        headerRight={
          <div className="flex items-center gap-2">
            <SourceTag source={addr.source} />
            <ConfidenceBadge confidence={addr.confidence} size="md" />
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Straße</Label>
                <Input value={addr.street} className="input-technical mt-1" readOnly />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Hausnummer</Label>
                <Input value={addr.houseNumber} className="input-technical mt-1" readOnly />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">PLZ</Label>
                <Input value={addr.postalCode} className="input-technical mt-1" readOnly />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Stadt</Label>
                <Input value={addr.city} className="input-technical mt-1" readOnly />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Bundesland</Label>
                <Input value={addr.state} className="input-technical mt-1" readOnly />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Land</Label>
                <Input value={addr.country} className="input-technical mt-1" readOnly />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Edit className="h-3.5 w-3.5" />
                Adresse bearbeiten
              </Button>
              <Button size="sm" className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                Adresse bestätigen
              </Button>
            </div>
          </div>

          {/* Map / Location */}
          <div className="space-y-3">
            <div className="aspect-[4/3] rounded-lg border-2 border-dashed bg-muted/20 flex items-center justify-center">
              <div className="text-center space-y-1.5">
                <Navigation className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground">Kartenansicht</p>
                {addr.coordinates && (
                  <p className="text-[10px] font-mono text-muted-foreground/60">
                    {addr.coordinates.lat.toFixed(4)}° N, {addr.coordinates.lng.toFixed(4)}° E
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/50 p-2">
                <span className="text-muted-foreground">Seehöhe</span>
                <p className="font-mono font-medium">{addr.elevation} m</p>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <span className="text-muted-foreground">Geländekat.</span>
                <p className="font-mono font-medium">{addr.terrainCategory}</p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Address candidates */}
      <SectionCard title="Erkannte Adressen" subtitle="Alle im Plan gefundenen Adressen mit Bewertung">
        <div className="space-y-2">
          {addr.alternatives.map((alt, i) => (
            <div key={i} className={`flex items-center justify-between rounded-md border p-3 ${alt.excluded ? 'bg-muted/30 opacity-70' : 'bg-muted/10'}`}>
              <div className="flex items-center gap-3">
                <MapPin className={`h-4 w-4 ${alt.excluded ? 'text-muted-foreground' : 'text-primary'}`} />
                <div>
                  <p className="text-sm font-medium">{alt.fullAddress}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alt.context}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ConfidenceBadge confidence={alt.confidence} />
                {alt.excluded ? (
                  <span className="status-badge-red text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                    <X className="h-2.5 w-2.5" />{alt.excludeReason}
                  </span>
                ) : (
                  <span className="status-badge-green text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                    <Check className="h-2.5 w-2.5" />Bauadresse
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
