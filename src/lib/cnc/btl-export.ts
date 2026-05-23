/**
 * BTL/BTLX-Export für Hundegger CNC-Maschinen.
 * Format: BTLX 2.2 (XML), kompatibel mit Hundegger Cambium, PrIO und Schmidt-Kunz Manager.
 */

import type { TimberMember } from '@/types/project';

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Typ-Mapping: interne Typen → BTL-Bauteiltyp */
function btlBeamRole(type: TimberMember['type']): string {
  switch (type) {
    case 'sparren':      return 'RafterBeam';
    case 'pfette':       return 'PurlinBeam';
    case 'kehlbalken':   return 'CollarBeam';
    case 'zange':        return 'TieBeam';
    case 'leimbinder':   return 'GlulamBeam';
    case 'stuetze':      return 'Post';
    case 'rahm':         return 'PlateBeam';
    case 'auswechslung': return 'TrimmerBeam';
    case 'nebentraeger': return 'SecondaryBeam';
    default:             return 'Beam';
  }
}

/** Winkel-Schätzung für Sparren-Firstschnitt (Grat/Pult) – Platzhalter 0° wenn unbekannt */
function estimateRoofAngle(member: TimberMember): number {
  // Wenn Membertyp Sparren: Standardneigung 30° als Fallback
  return member.type === 'sparren' ? 30 : 0;
}

/** Kerven/Notches generieren – einfache Heuristic für Firstschnitt + Traufschnitt bei Sparren */
function buildNotches(member: TimberMember): string {
  if (member.type !== 'sparren') return '';
  const angle = estimateRoofAngle(member);
  return `
        <Notches>
          <Notch Type="JackRafterCut" Position="Start" Angle="${angle}" Side="Top" Depth="${(member.height * 0.5).toFixed(0)}"/>
          <Notch Type="BirdsMouth" Position="End" Angle="${angle}" Depth="${Math.min(member.height * 0.3, 40).toFixed(0)}" Width="60"/>
        </Notches>`;
}

// ─── XML-Aufbau ───────────────────────────────────────────────────────────────

function memberToBeamXml(member: TimberMember, id: number): string {
  const lengthMM = Math.round(member.length * 1000); // m → mm
  const width    = Math.round(member.width);
  const height   = Math.round(member.height);
  const role     = btlBeamRole(member.type);
  const notches  = buildNotches(member);

  // Querschnitt-Label: "b x h"
  const cs = `${width}x${height}`;

  // Einfache Lage: Achse entlang X-Richtung, Ursprung bei 0/0/0
  return `      <Beam ID="${id}" Role="${role}" Length="${lengthMM}" CrossSection="${cs}" Material="${member.material || 'C24'}" Quantity="${member.quantity}">
        <Name>${escapeXml(member.name)}</Name>
        <StartPosition x="0" y="0" z="0"/>
        <EndPosition x="${lengthMM}" y="0" z="0"/>
        <ReferenceSide>Top</ReferenceSide>${notches}
      </Beam>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Erzeugt BTLX 2.2 XML-String für eine Liste von TimberMembers.
 */
export function exportToBTL(members: TimberMember[], projectName: string): string {
  const now = new Date().toISOString();
  const beams = members
    .map((m, i) => memberToBeamXml(m, i + 1))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<BTLx Version="2.2" xmlns="https://www.design2machine.com" GeneratedAt="${now}">
  <FileHeader>
    <Generator>Dachplan-Assistent</Generator>
    <ProjectName>${escapeXml(projectName)}</ProjectName>
    <Author>Dachplan-Assistent CNC-Export</Author>
    <Date>${now.slice(0, 10)}</Date>
  </FileHeader>
  <Project Name="${escapeXml(projectName)}">
    <Parts>
${beams}
    </Parts>
  </Project>
</BTLx>`;
}

/**
 * Erzeugt BTLX-Datei und startet Browser-Download.
 */
export function downloadBTL(members: TimberMember[], projectName: string): void {
  const xml  = exportToBTL(members, projectName);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${projectName.replace(/\s+/g, '_')}_CNC.btlx`;
  a.click();
  URL.revokeObjectURL(url);
}
