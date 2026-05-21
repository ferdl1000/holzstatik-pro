import { knToKg, knPerM2ToKgPerM2 } from '@/lib/units';

interface DualUnitProps {
  /** Wert in kN, kN/m oder kN/m² (je nach Variante) */
  value: number;
  /** Typ entscheidet über Umrechnung */
  variant?: 'force' | 'lineLoad' | 'areaLoad' | 'moment';
  /** Anzahl Nachkommastellen */
  decimals?: number;
  /** Nur Hauptwert anzeigen, Sekundär als Tooltip */
  compact?: boolean;
  className?: string;
}

/**
 * Zeigt einen Wert immer in der ingenieursmäßigen Einheit + kg-Äquivalent.
 * Beispiel: "12,5 kN ≈ 1.275 kg"
 *
 * Hilft Laien, "abstrakte" Newton-Werte in greifbare Kilogramm zu übersetzen.
 */
export function DualUnit({ value, variant = 'force', decimals = 2, compact = false, className = '' }: DualUnitProps) {
  let primary: string;
  let secondary: string;

  switch (variant) {
    case 'lineLoad': {
      const kgm = (value * 1000) / 9.81;
      primary = `${value.toLocaleString('de-AT', { maximumFractionDigits: decimals })} kN/m`;
      secondary = `≈ ${kgm.toLocaleString('de-AT', { maximumFractionDigits: 0 })} kg/m`;
      break;
    }
    case 'areaLoad': {
      const kgm2 = knPerM2ToKgPerM2(value);
      primary = `${value.toLocaleString('de-AT', { maximumFractionDigits: decimals })} kN/m²`;
      secondary = `≈ ${kgm2.toLocaleString('de-AT', { maximumFractionDigits: 0 })} kg/m²`;
      break;
    }
    case 'moment': {
      const kgm = (value * 1000) / 9.81;
      primary = `${value.toLocaleString('de-AT', { maximumFractionDigits: decimals })} kNm`;
      secondary = `≈ ${kgm.toLocaleString('de-AT', { maximumFractionDigits: 0 })} kg·m`;
      break;
    }
    case 'force':
    default: {
      const kg = knToKg(value);
      primary = `${value.toLocaleString('de-AT', { maximumFractionDigits: decimals })} kN`;
      secondary = `≈ ${kg.toLocaleString('de-AT', { maximumFractionDigits: 0 })} kg`;
    }
  }

  if (compact) {
    return (
      <span className={`font-mono tabular-nums ${className}`} title={secondary}>
        {primary}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className="font-mono tabular-nums font-medium">{primary}</span>
      <span className="text-xs text-muted-foreground font-mono">{secondary}</span>
    </span>
  );
}
