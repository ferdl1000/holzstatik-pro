export interface AufbauSchicht {
  thickness_mm?: number;
  name: string;
  material?: string;
  function?: 'lasttragend' | 'eindeckung' | 'unterdach' | 'lattung' | 'daemmung' | 'dampfsperre' | 'sichtschicht' | 'oberbelag' | 'sonstiges';
}

export interface Aufbau {
  code: string;
  type: 'boden' | 'decke' | 'dach' | 'wand' | 'unbekannt';
  name?: string;
  schichten: AufbauSchicht[];
  totalThickness_mm?: number;
}

/** Leitet den Aufbau-Typ aus Code-Buchstabe (Lechner) oder Inhalt (Lebenbauer) ab */
function inferTypeFromCode(code: string, name?: string, lines: string[] = []): 'boden' | 'decke' | 'dach' | 'wand' | 'unbekannt' {
  // 1. Code-Buchstabe (Lechner-Schema)
  const c = code.charAt(0).toUpperCase();
  if (c === 'B') return 'boden';
  if (c === 'D') return 'dach';
  if (c === 'W') return 'wand';
  if (c === 'K') return 'decke';
  if (c === 'F') return 'boden'; // Fundament

  // 2. Wenn rein numerisch (Lebenbauer-Schema): aus name + Inhalt ableiten
  if (/^\d+$/.test(code)) {
    const text = ((name || '') + ' ' + lines.join(' ')).toLowerCase();
    if (text.includes('dach') || text.includes('eindeckung') || text.includes('sparen') || text.includes('sparren') || text.includes('first')) return 'dach';
    if (text.includes('terrasse') || (text.includes('decke') && !text.includes('dach'))) return 'decke';
    if (text.includes('fundament') || text.includes('schotter') || text.includes('frostschutz') || text.includes('boden')) return 'boden';
    if (text.includes('wand') || text.includes('außen') || text.includes('innen') || text.includes('mauer')) return 'wand';
  }
  return 'unbekannt';
}

/** Parst eine Aufbau-Beschreibung (mehrere Zeilen Text) in strukturierte Schichten */
export function parseAufbau(code: string, lines: string[], name?: string): Aufbau {
  const type = inferTypeFromCode(code, name, lines);

  const schichten: AufbauSchicht[] = lines
    .map(line => (typeof line === 'string' ? line : String(line)).trim())
    .filter(line => line.length > 0)
    .map(line => {
      // "14 cm Trapezblech" oder "2.4 cm Bretterschalung" oder "BSH Tragkonstruktion lt. Statik"
      const match = line.match(/^(?:[-•]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s+)?(.+)$/i);
      if (!match) return { name: line };
      const thickness_mm = match[1]
        ? convertToMm(parseFloat(match[1].replace(',', '.')), match[2] || 'cm')
        : undefined;
      const schichtName = match[3].trim();
      const material = extractMaterial(schichtName);
      const fn = detectFunction(schichtName);
      return { thickness_mm, name: schichtName, material, function: fn };
    });

  const totalThickness = schichten.reduce((s, l) => s + (l.thickness_mm ?? 0), 0);
  return { code, type, name, schichten, totalThickness_mm: totalThickness || undefined };
}

function convertToMm(value: number, unit: string): number {
  if (unit === 'm') return value * 1000;
  if (unit === 'cm') return value * 10;
  return value; // mm
}

function extractMaterial(text: string): string | undefined {
  const tl = text.toLowerCase();
  if (tl.includes('stahlbeton') || tl.includes('stb')) return 'Stahlbeton';
  if (tl.includes('beton')) return 'Beton';
  if (tl.includes('bsh')) return 'BSH';
  if (tl.includes('kvh')) return 'KVH';
  if (tl.includes('osb')) return 'OSB';
  if (tl.includes('kiefer')) return 'Kiefer';
  if (tl.includes('fichte')) return 'Fichte';
  if (tl.includes('lärche')) return 'Lärche';
  if (tl.includes('pfosten')) return 'Pfostenholz';
  if (tl.includes('trapezblech')) return 'Trapezblech';
  if (tl.includes('stehfalz')) return 'Stehfalz Zink';
  if (tl.includes('scharren') && tl.includes('ziegel')) return 'Tondachziegel';
  if (tl.includes('scharren')) return 'Klinker/Ziegelmauerwerk';
  if (tl.includes('38er')) return 'Ziegelmauerwerk 38';
  if (tl.includes('ziegel')) return 'Tondachziegel';
  if (tl.includes('mineralwolle')) return 'Mineralwolle';
  if (tl.includes('zellulose')) return 'Zellulose';
  if (tl.includes('frostschutz')) return 'Frostschutz';
  if (tl.includes('schweißbahn') || tl.includes('bitumen')) return 'Bitumenschweißbahn';
  if (tl.includes('elastomer')) return 'Elastomerlager';
  if (tl.includes('gefällebeton')) return 'Gefällebeton';
  if (tl.includes('sauberkeit')) return 'Sauberkeitsschicht-Beton';
  if (tl.includes('dachpaneel') || tl.includes('paneel')) return 'Sandwichpaneel';
  if (tl.includes('abdichtung')) return 'Abdichtungsbahn';
  if (tl.includes('konterlattung')) return 'Konterlattung';
  if (tl.includes('vollschalung')) return 'Vollschalung';
  if (tl.includes('schalung')) return 'Schalung';
  if (tl.includes('lattung')) return 'Lattung';
  if (tl.includes('estrich')) return 'Estrich';
  return undefined;
}

function detectFunction(text: string): AufbauSchicht['function'] {
  const tl = text.toLowerCase();
  if (tl.includes('tragkonstruktion') || tl.includes('bsh') || tl.includes('kvh') || tl.includes('stahlbeton') || tl.includes('stb') || tl.includes('sparen') || tl.includes('sparren') || tl.includes('gefällebeton') || tl.includes('sauberkeit')) return 'lasttragend';
  if (tl.includes('trapezblech') || tl.includes('ziegel') || tl.includes('stehfalz') || tl.includes('schiefer') || tl.includes('scharren') || (tl.includes('dachpaneel') || tl.includes('paneel'))) return 'eindeckung';
  if (tl.includes('schweiß') || tl.includes('bitumen') || tl.includes('abdichtung')) return 'eindeckung'; // Flachdach
  if (tl.includes('unterdach') || tl.includes('unterspann') || tl.includes('schalungsbahn')) return 'unterdach';
  if (tl.includes('vollschalung') || tl.includes('rauschalung')) return 'unterdach';
  if (tl.includes('staffel') || tl.includes('konterlattung') || tl.includes('lattung')) return 'lattung';
  if (tl.includes('dämmung') || tl.includes('daemmung') || tl.includes('mineralwolle') || tl.includes('zellulose')) return 'daemmung';
  if (tl.includes('dampfbremse') || tl.includes('dampfsperre')) return 'dampfsperre';
  if (tl.includes('estrich')) return 'oberbelag';
  if (tl.includes('schalung') || tl.includes('belag')) return 'oberbelag';
  return undefined;
}

/** Bestimmt aus einem Aufbau die wahrscheinliche Eindeckung */
export function coveringFromAufbau(aufbau: Aufbau): { type: string; name: string } | null {
  if (aufbau.type !== 'dach') return null;
  const eindeck = aufbau.schichten.find(s => s.function === 'eindeckung');
  const source = eindeck ?? aufbau.schichten[aufbau.schichten.length - 1];
  if (!source) return null;
  const tl = source.name.toLowerCase();
  if (tl.includes('trapezblech')) return { type: 'trapezblech', name: source.name };
  if (tl.includes('stehfalz') || tl.includes('falz')) return { type: 'metal_falz', name: source.name };
  if (tl.includes('scharren') && tl.includes('ziegel')) return { type: 'tile_clay', name: source.name };
  if (tl.includes('dachpaneel') || tl.includes('paneel')) return { type: 'sandwich_paneel', name: source.name };
  if (tl.includes('ziegel')) return { type: 'tile_clay', name: source.name };
  if (tl.includes('beton')) return { type: 'tile_concrete', name: source.name };
  if (tl.includes('schiefer')) return { type: 'schiefer', name: source.name };
  if (tl.includes('sandwich')) return { type: 'sandwich_paneel', name: source.name };
  if (tl.includes('bitumen') || tl.includes('schweißbahn') || tl.includes('abdichtung')) return { type: 'bitumen', name: source.name };
  if (tl.includes('dacheindeckung')) return { type: 'unbekannt', name: 'Dacheindeckung (Typ nicht spezifiziert)' };
  if (!eindeck) return null; // fallback was last layer but no keyword matched
  return { type: 'sonstiges', name: source.name };
}

/** Bestimmt aus einem Aufbau die wahrscheinliche Dämmung */
export function insulationFromAufbau(aufbau: Aufbau): { material: string; thickness_mm: number } | null {
  const daem = aufbau.schichten.find(s => s.function === 'daemmung');
  if (!daem || !daem.thickness_mm) return null;
  return { material: daem.material ?? daem.name, thickness_mm: daem.thickness_mm };
}
