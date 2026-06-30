/**
 * Echte Abbund-Schnittwinkel (Schmiegen) je Bauteil — aus der tatsächlichen
 * Dachneigung berechnet, NICHT hartcodiert. Das ist die Voraussetzung für einen
 * Abbundplan, mit dem man wirklich hinausgehen und zuschneiden kann.
 *
 * Grundprinzip Zimmerei:
 *  - Sparren First-/Fußschnitt (Schmiege) = Dachneigungswinkel α (gemessen vom Lot).
 *    Bei Pultdach/Satteldach ist das die einzige Schräge, ein einfacher Winkelschnitt.
 *  - Kehlbalken-Enden werden im selben Winkel α angeschnitten (liegen parallel zur
 *    Sparrenebene auf).
 *  - Pfette/Stütze/Rähm: i.d.R. rechtwinkliger (90°) Ablängschnitt.
 *  - Grat-/Kehlsparren (Walmdach): zusätzlicher Verschnitt durch die 45°-Diagonale
 *    in der Draufsicht — Näherungsformel, auf der Baustelle mit der Schmiege zu
 *    kontrollieren (Kompromiss, da exakte Grat-Geometrie vom Grundriss abhängt).
 */
import type { TimberMember } from '@/types/project';
import type { RoofPart, RoofFormType } from '@/types/roofParts';

export interface CutEnd {
  /** Schnitttyp am Bauteilende. */
  type: 'rechtwinklig' | 'schmiege' | 'vogelschnabel' | 'grat_schmiege';
  /** Schnittwinkel in Grad, gemessen vom rechten Winkel (0° = gerader Schnitt). */
  angleDeg: number;
  /** Klartext für den Zimmerer. */
  label: string;
}

export interface MemberCutPlan {
  memberId: string;
  memberName: string;
  pitchDeg: number;
  startCut: CutEnd;
  endCut: CutEnd;
  /** Quelle der verwendeten Neigung (welcher Dachteil) — für Nachvollziehbarkeit. */
  pitchSource: string;
}

const deg = (rad: number) => (rad * 180) / Math.PI;

/** Grat-/Kehlwinkel-Näherung für Walmdach: Diagonalfaktor bei 45°-Grundriss. */
function hipCutAngleDeg(pitchDeg: number): number {
  // tan(Gratwinkel) = tan(Dachneigung) / sqrt(2)  — Standardnäherung für 90°-Eck/45°-Grat.
  const pitchRad = (pitchDeg * Math.PI) / 180;
  return deg(Math.atan(Math.tan(pitchRad) / Math.SQRT2));
}

/**
 * Berechnet die realen Schnittwinkel für EIN Bauteil bei gegebener Dachneigung.
 * pitchDeg muss aus der tatsächlichen Projekt-/Dachteil-Geometrie stammen.
 */
export function computeMemberCuts(member: TimberMember, pitchDeg: number, form: RoofFormType, pitchSource: string): MemberCutPlan {
  const isHipMember = form === 'walmdach' || form === 'krueppelwalmdach';

  let startCut: CutEnd;
  let endCut: CutEnd;

  if (member.type === 'sparren' || member.type === 'nebentraeger') {
    const schmiegeAngle = isHipMember ? hipCutAngleDeg(pitchDeg) : pitchDeg;
    const cutType: CutEnd['type'] = isHipMember ? 'grat_schmiege' : 'schmiege';
    startCut = {
      type: cutType, angleDeg: +schmiegeAngle.toFixed(1),
      label: isHipMember
        ? `Gratschmiege First ${schmiegeAngle.toFixed(1)}° (Näherung — vor Ort mit Schmiege prüfen)`
        : `Firstschnitt, Schmiege ${schmiegeAngle.toFixed(1)}°`,
    };
    endCut = {
      type: 'vogelschnabel', angleDeg: +pitchDeg.toFixed(1),
      label: `Vogelschnabel/Traufschnitt, Schmiege ${pitchDeg.toFixed(1)}° (Aufschnitt nach Pfettenmaß vor Ort anreißen)`,
    };
  } else if (member.type === 'kehlbalken') {
    startCut = { type: 'schmiege', angleDeg: +pitchDeg.toFixed(1), label: `Anschnitt Sparrenanlage, Schmiege ${pitchDeg.toFixed(1)}°` };
    endCut = { type: 'schmiege', angleDeg: +pitchDeg.toFixed(1), label: `Anschnitt Sparrenanlage, Schmiege ${pitchDeg.toFixed(1)}°` };
  } else {
    startCut = { type: 'rechtwinklig', angleDeg: 0, label: 'Rechtwinkliger Ablängschnitt' };
    endCut = { type: 'rechtwinklig', angleDeg: 0, label: 'Rechtwinkliger Ablängschnitt' };
  }

  return { memberId: member.id, memberName: member.name, pitchDeg, startCut, endCut, pitchSource };
}

/**
 * Baut den vollständigen Abbund-Schnittplan für ein Projekt: ordnet jedem Bauteil
 * die Neigung SEINES Dachteils zu (falls roofParts vorhanden), sonst die
 * Gesamt-Dachneigung des Projekts. Kein Bauteil bleibt ohne reale Winkelangabe.
 */
export function buildAbbundplan(
  members: TimberMember[],
  roofParts: RoofPart[] | undefined,
  fallbackPitchDeg: number,
  fallbackForm: RoofFormType,
): MemberCutPlan[] {
  if (roofParts && roofParts.length > 0) {
    const byId = new Map<string, { pitch: number; form: RoofFormType; label: string }>();
    for (const rp of roofParts) {
      for (const m of rp.members) {
        byId.set(m.id, { pitch: rp.geometry.pitch, form: rp.form, label: rp.label });
      }
    }
    return members.map((m) => {
      const ctx = byId.get(m.id);
      return ctx
        ? computeMemberCuts(m, ctx.pitch, ctx.form, ctx.label)
        : computeMemberCuts(m, fallbackPitchDeg, fallbackForm, 'Gesamtprojekt (Dachteil nicht zugeordnet)');
    });
  }
  return members.map((m) => computeMemberCuts(m, fallbackPitchDeg, fallbackForm, 'Gesamtprojekt'));
}
