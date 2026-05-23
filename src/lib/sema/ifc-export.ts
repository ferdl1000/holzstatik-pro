/**
 * IFC-Export (STEP-ASCII) für SEMA CAD-Import.
 * Erzeugt IFC4 und IFC2x3 Varianten.
 *
 * exportToIFC4()   – SEMA 19+, Allplan, Revit
 * exportToIFC2x3() – SEMA 12-18, AutoCAD Architecture, ArchiCAD
 * exportToIFC()    – Alias für exportToIFC4() (Backward-Compat.)
 */

import type { Project, TimberMember } from '@/types/project';

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

let _id = 0;
function nextId(): number { return ++_id; }
function resetId(): void  { _id = 0; }

function ifcReal(n: number): string {
  return n.toFixed(6);
}

function ifcLabel(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Typ-Mapping: intern → IFC-Bauteilrolle */
function ifcBeamType(type: TimberMember['type']): string {
  switch (type) {
    case 'sparren':      return 'RAFTER';
    case 'pfette':       return 'PURLIN';
    case 'kehlbalken':   return 'COLLAR_BEAM';
    case 'leimbinder':   return 'GLULAM_BEAM';
    case 'stuetze':      return 'COLUMN';
    default:             return 'BEAM';
  }
}

/** Material-Name → IFC-Materialklasse */
function ifcMaterialName(material: string): string {
  const m = material.toLowerCase();
  if (m.includes('gl24') || m.includes('bsh') || m.includes('leimbinder')) return 'GL24h';
  if (m.includes('gl28'))  return 'GL28h';
  if (m.includes('c16'))   return 'C16';
  if (m.includes('c30'))   return 'C30';
  return 'C24';
}

// ─── IFC-Eintrags-Erzeuger ────────────────────────────────────────────────────

interface IfcLine { id: number; line: string; }

function L(id: number, body: string): IfcLine {
  return { id, line: `#${id} = ${body};` };
}

// ─── Gemeinsame Basis-Entities ────────────────────────────────────────────────

interface BaseIds {
  idOrg: number; idApp: number; idPerson: number; idOwner: number;
  idUnit_m: number; idUnit_m2: number; idUnit_m3: number;
  idUnit_rad: number; idUnit_kg: number; idUnit_s: number;
  idUnitAssign: number; idWorldCtx: number;
  idProject: number;
  idSitePlace: number; idSitePlaceRef: number; idSite: number;
  idBldgPlace: number; idBldgPlaceRef: number; idBldg: number;
  idStoreyPlace: number; idStoreyPlaceRef: number; idStorey: number;
  idRelSite: number; idRelBldg: number; idRelStorey: number; idRelContains: number;
  idOrigin: number; idAxisX: number; idAxisZ: number; idAxisY: number;
}

function allocBaseIds(): BaseIds {
  return {
    idOrg: nextId(), idApp: nextId(), idPerson: nextId(), idOwner: nextId(),
    idUnit_m: nextId(), idUnit_m2: nextId(), idUnit_m3: nextId(),
    idUnit_rad: nextId(), idUnit_kg: nextId(), idUnit_s: nextId(),
    idUnitAssign: nextId(), idWorldCtx: nextId(),
    idProject: nextId(),
    idSitePlace: nextId(), idSitePlaceRef: nextId(), idSite: nextId(),
    idBldgPlace: nextId(), idBldgPlaceRef: nextId(), idBldg: nextId(),
    idStoreyPlace: nextId(), idStoreyPlaceRef: nextId(), idStorey: nextId(),
    idRelSite: nextId(), idRelBldg: nextId(), idRelStorey: nextId(), idRelContains: nextId(),
    idOrigin: nextId(), idAxisX: nextId(), idAxisZ: nextId(), idAxisY: nextId(),
  };
}

interface BeamIds {
  placement3d: number;
  placement:   number;
  profileDef:  number;
  extruded:    number;
  shapeRep:    number;
  productDef:  number;
  beam:        number;
  material:    number;
  matAssoc:    number;
}

// ─── IFC4 Wall-Lines ──────────────────────────────────────────────────────────

interface WallGeometry {
  length: number; width: number; eavesHeight: number; wallThickness: number;
}

interface WallSpec {
  id: string; name: string;
  px: number; py: number; pz: number;  // placement origin
  wallLength: number;                   // Extrusionslänge
  wallHeight: number;                   // Extrusion Z (eavesHeight)
  wallThickness: number;
  dirX: number; dirY: number;           // Orientierungsvektor in XY-Ebene
}

function wallSpecs(g: WallGeometry): WallSpec[] {
  const { length: len, width: wid, eavesHeight: h, wallThickness: t } = g;
  return [
    { id: 'wall_front',  name: 'Außenwand Traufseite Vorne',  px: -len/2, py: -wid/2, pz: 0, wallLength: len, wallHeight: h, wallThickness: t, dirX: 1, dirY: 0 },
    { id: 'wall_back',   name: 'Außenwand Traufseite Hinten', px:  len/2, py:  wid/2, pz: 0, wallLength: len, wallHeight: h, wallThickness: t, dirX: -1, dirY: 0 },
    { id: 'wall_left',   name: 'Giebelwand Links',            px: -len/2, py:  wid/2, pz: 0, wallLength: wid, wallHeight: h, wallThickness: t, dirX: 0, dirY: -1 },
    { id: 'wall_right',  name: 'Giebelwand Rechts',           px:  len/2, py: -wid/2, pz: 0, wallLength: wid, wallHeight: h, wallThickness: t, dirX: 0, dirY:  1 },
  ];
}

function buildWallLinesIFC4(
  geo: WallGeometry,
  b: BaseIds,
): { lines: string[]; wallIds: number[] } {
  const lines: string[] = [];
  const wallIds: number[] = [];
  const specs = wallSpecs(geo);

  specs.forEach((ws, idx) => {
    const idPlace3d   = nextId();
    const idPlace     = nextId();
    const idProfile   = nextId();
    const idExtruded  = nextId();
    const idShapeRep  = nextId();
    const idProdDef   = nextId();
    const idWall      = nextId();
    const idMat       = nextId();
    const idMatAssoc  = nextId();

    const angle = Math.atan2(ws.dirY, ws.dirX);
    const cosA  = Math.cos(angle).toFixed(6);
    const sinA  = Math.sin(angle).toFixed(6);

    lines.push(`#${idPlace3d}  = IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((${ifcReal(ws.px)},${ifcReal(ws.py)},${ifcReal(ws.pz)})),#${b.idAxisZ},IFCDIRECTION((${cosA},${sinA},0.)));`);
    lines.push(`#${idPlace}    = IFCLOCALPLACEMENT(#${b.idStoreyPlace},#${idPlace3d});`);
    // Rechteckprofil: Breite = wallThickness, Tiefe = wallLength (wird in X extrudiert)
    lines.push(`#${idProfile}  = IFCRECTANGLEPROFILEDEF(.AREA.,$,IFCAXIS2PLACEMENT2D(IFCCARTESIANPOINT((0.,0.)),$),${ifcReal(ws.wallThickness)},${ifcReal(ws.wallLength)});`);
    lines.push(`#${idExtruded} = IFCEXTRUDEDAREASOLID(#${idProfile},IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,0.)),IFCDIRECTION((0.,0.,1.)),IFCDIRECTION((1.,0.,0.))),IFCDIRECTION((0.,0.,1.)),${ifcReal(ws.wallHeight)});`);
    lines.push(`#${idShapeRep} = IFCSHAPEREPRESENTATION(#${b.idWorldCtx},${ifcLabel('Body')},${ifcLabel('SweptSolid')},(#${idExtruded}));`);
    lines.push(`#${idProdDef}  = IFCPRODUCTDEFINITIONSHAPE($,$,(#${idShapeRep}));`);
    lines.push(`#${idWall}     = IFCWALLSTANDARDCASE(${ifcLabel(ws.id)},#${b.idOwner},${ifcLabel(ws.name)},${ifcLabel('Mauerwerk')},$,#${idPlace},#${idProdDef},$);`);
    lines.push(`#${idMat}      = IFCMATERIAL(${ifcLabel('Mauerwerk')},$,$);`);
    lines.push(`#${idMatAssoc} = IFCRELASSOCIATESMATERIAL(${ifcLabel('wallmat_' + idx)},#${b.idOwner},$,$,(#${idWall}),#${idMat});`);
    wallIds.push(idWall);
  });

  return { lines, wallIds };
}

function buildWallLinesIFC2x3(
  geo: WallGeometry,
  b: BaseIds,
): { lines: string[]; wallIds: number[] } {
  const lines: string[] = [];
  const wallIds: number[] = [];
  const specs = wallSpecs(geo);

  specs.forEach((ws, idx) => {
    const idPlace3d   = nextId();
    const idPlace     = nextId();
    const idProfile   = nextId();
    const idExtruded  = nextId();
    const idShapeRep  = nextId();
    const idProdDef   = nextId();
    const idWall      = nextId();
    const idMat       = nextId();
    const idMatLayer  = nextId();
    const idLayerSet  = nextId();
    const idMatAssoc  = nextId();

    const angle = Math.atan2(ws.dirY, ws.dirX);
    const cosA  = Math.cos(angle).toFixed(6);
    const sinA  = Math.sin(angle).toFixed(6);

    lines.push(`#${idPlace3d}  = IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((${ifcReal(ws.px)},${ifcReal(ws.py)},${ifcReal(ws.pz)})),#${b.idAxisZ},IFCDIRECTION((${cosA},${sinA},0.)));`);
    lines.push(`#${idPlace}    = IFCLOCALPLACEMENT(#${b.idStoreyPlace},#${idPlace3d});`);
    lines.push(`#${idProfile}  = IFCRECTANGLEPROFILEDEF(.AREA.,$,IFCAXIS2PLACEMENT2D(IFCCARTESIANPOINT((0.,0.)),$),${ifcReal(ws.wallThickness)},${ifcReal(ws.wallLength)});`);
    lines.push(`#${idExtruded} = IFCEXTRUDEDAREASOLID(#${idProfile},IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,0.)),IFCDIRECTION((0.,0.,1.)),IFCDIRECTION((1.,0.,0.))),IFCDIRECTION((0.,0.,1.)),${ifcReal(ws.wallHeight)});`);
    lines.push(`#${idShapeRep} = IFCSHAPEREPRESENTATION(#${b.idWorldCtx},${ifcLabel('Body')},${ifcLabel('SweptSolid')},(#${idExtruded}));`);
    lines.push(`#${idProdDef}  = IFCPRODUCTDEFINITIONSHAPE($,$,(#${idShapeRep}));`);
    // IFC2x3: IFCWALLSTANDARDCASE ohne PredefinedType
    lines.push(`#${idWall}     = IFCWALLSTANDARDCASE(${ifcLabel(ws.id)},#${b.idOwner},${ifcLabel(ws.name)},${ifcLabel('Mauerwerk')},$,#${idPlace},#${idProdDef},$);`);
    lines.push(`#${idMat}      = IFCMATERIAL(${ifcLabel('Mauerwerk')});`);
    lines.push(`#${idMatLayer} = IFCMATERIALLAYER(#${idMat},${ifcReal(ws.wallThickness)},$);`);
    lines.push(`#${idLayerSet} = IFCMATERIALLAYERSET((#${idMatLayer}),${ifcLabel('Mauerwerk')});`);
    lines.push(`#${idMatAssoc} = IFCRELASSOCIATESMATERIAL(${ifcLabel('wallmat_' + idx)},#${b.idOwner},$,$,(#${idWall}),#${idLayerSet});`);
    wallIds.push(idWall);
  });

  return { lines, wallIds };
}

// ─── Storey-Hierarchie für mehrere Decken ─────────────────────────────────────

interface StoreyIds {
  place3d: number; place: number; storey: number; elevation: number;
}

function buildMultiStoreyLines(
  ceilings: Array<{ id: string; level: string }>,
  b: BaseIds,
  projectId: string,
  ownerHistId: number,
  bldgId: number,
): { lines: string[]; storeyIds: StoreyIds[]; relAggId: number } {
  const lines: string[] = [];
  const storeyIds: StoreyIds[] = [];

  // Storey-Ebenen: EG=0, OG=3, DG=6, Spitzboden=9 (schematisch)
  const levelElevation: Record<string, number> = {
    'EG': 0, 'OG': 3, 'DG': 6, 'Spitzboden': 9,
  };

  // Eindeutige Levels aus ceilings + immer DG (Dachgeschoss)
  const levels = ['EG', ...ceilings.map(c => c.level), 'DG']
    .filter((v, i, a) => a.indexOf(v) === i);

  for (const lvl of levels) {
    const elev = levelElevation[lvl] ?? 0;
    const p3d = nextId();
    const pl  = nextId();
    const st  = nextId();
    lines.push(`#${p3d} = IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,${ifcReal(elev)})),#${b.idAxisZ},#${b.idAxisX});`);
    lines.push(`#${pl}  = IFCLOCALPLACEMENT(#${b.idBldgPlace},#${p3d});`);
    lines.push(`#${st}  = IFCBUILDINGSTOREY(${ifcLabel(projectId + '_storey_' + lvl)},#${ownerHistId},${ifcLabel(lvl)},$,$,#${pl},$,$,.ELEMENT.,${ifcReal(elev)});`);
    storeyIds.push({ place3d: p3d, place: pl, storey: st, elevation: elev });
  }

  const storeyRefs = storeyIds.map(s => `#${s.storey}`).join(',');
  const relAggId = nextId();
  lines.push(`#${relAggId} = IFCRELAGGREGATES(${ifcLabel('rel_storeys_multi')},#${ownerHistId},$,$,#${bldgId},(${storeyRefs}));`);

  return { lines, storeyIds, relAggId };
}

function allocBeamIds(members: TimberMember[]): BeamIds[] {
  return members.map(() => ({
    placement3d: nextId(),
    placement:   nextId(),
    profileDef:  nextId(),
    extruded:    nextId(),
    shapeRep:    nextId(),
    productDef:  nextId(),
    beam:        nextId(),
    material:    nextId(),
    matAssoc:    nextId(),
  }));
}

function buildBaseLines(b: BaseIds, project: Project): string[] {
  const lines: string[] = [];
  lines.push(`#${b.idOrg}          = IFCORGANIZATION($,${ifcLabel('Dachplan-Assistent')},$,$,$);`);
  lines.push(`#${b.idApp}          = IFCAPPLICATION(#${b.idOrg},'1.0',${ifcLabel('Dachplan-Assistent')},${ifcLabel('dachplan-assistent')});`);
  lines.push(`#${b.idPerson}       = IFCPERSON($,${ifcLabel('Dachplan-Assistent')},$,$,$,$,$,$);`);
  lines.push(`#${b.idOwner}        = IFCOWNERHISTORY(#${b.idPerson},#${b.idApp},$,.ADDED.,$,$,$,0);`);
  lines.push(`#${b.idUnit_m}       = IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  lines.push(`#${b.idUnit_m2}      = IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
  lines.push(`#${b.idUnit_m3}      = IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);`);
  lines.push(`#${b.idUnit_rad}     = IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`);
  lines.push(`#${b.idUnit_kg}      = IFCSIUNIT(*,.MASSUNIT.,$,.GRAM.);`);
  lines.push(`#${b.idUnit_s}       = IFCSIUNIT(*,.TIMEUNIT.,$,.SECOND.);`);
  lines.push(`#${b.idUnitAssign}   = IFCUNITASSIGNMENT((#${b.idUnit_m},#${b.idUnit_m2},#${b.idUnit_m3},#${b.idUnit_rad},#${b.idUnit_kg},#${b.idUnit_s}));`);
  lines.push(`#${b.idWorldCtx}     = IFCGEOMETRICREPRESENTATIONCONTEXT($,${ifcLabel('Model')},3,1.E-05,#${b.idStoreyPlaceRef},$);`);
  lines.push(`#${b.idOrigin}       = IFCCARTESIANPOINT((0.,0.,0.));`);
  lines.push(`#${b.idAxisX}        = IFCDIRECTION((1.,0.,0.));`);
  lines.push(`#${b.idAxisZ}        = IFCDIRECTION((0.,0.,1.));`);
  lines.push(`#${b.idAxisY}        = IFCDIRECTION((0.,1.,0.));`);
  lines.push(`#${b.idProject}      = IFCPROJECT(${ifcLabel(project.id)},#${b.idOwner},${ifcLabel(project.name)},$,$,$,$,(#${b.idWorldCtx}),#${b.idUnitAssign});`);
  lines.push(`#${b.idSitePlaceRef} = IFCAXIS2PLACEMENT3D(#${b.idOrigin},#${b.idAxisZ},#${b.idAxisX});`);
  lines.push(`#${b.idSitePlace}    = IFCLOCALPLACEMENT($,#${b.idSitePlaceRef});`);
  lines.push(`#${b.idSite}         = IFCSITE(${ifcLabel(project.id + '_site')},#${b.idOwner},${ifcLabel('Baustelle')},$,$,#${b.idSitePlace},$,$,.ELEMENT.,$,$,$,$,$);`);
  lines.push(`#${b.idBldgPlaceRef} = IFCAXIS2PLACEMENT3D(#${b.idOrigin},#${b.idAxisZ},#${b.idAxisX});`);
  lines.push(`#${b.idBldgPlace}    = IFCLOCALPLACEMENT(#${b.idSitePlace},#${b.idBldgPlaceRef});`);
  lines.push(`#${b.idBldg}         = IFCBUILDING(${ifcLabel(project.id + '_bldg')},#${b.idOwner},${ifcLabel(project.name)},$,$,#${b.idBldgPlace},$,$,.ELEMENT.,$,$,$);`);
  lines.push(`#${b.idStoreyPlaceRef} = IFCAXIS2PLACEMENT3D(#${b.idOrigin},#${b.idAxisZ},#${b.idAxisX});`);
  lines.push(`#${b.idStoreyPlace}    = IFCLOCALPLACEMENT(#${b.idBldgPlace},#${b.idStoreyPlaceRef});`);
  lines.push(`#${b.idStorey}         = IFCBUILDINGSTOREY(${ifcLabel(project.id + '_storey')},#${b.idOwner},${ifcLabel('Dachgeschoss')},$,$,#${b.idStoreyPlace},$,$,.ELEMENT.,0.);`);
  lines.push(`#${b.idRelSite}      = IFCRELAGGREGATES(${ifcLabel('rel_site')},#${b.idOwner},$,$,#${b.idProject},(#${b.idSite}));`);
  lines.push(`#${b.idRelBldg}      = IFCRELAGGREGATES(${ifcLabel('rel_bldg')},#${b.idOwner},$,$,#${b.idSite},(#${b.idBldg}));`);
  lines.push(`#${b.idRelStorey}    = IFCRELAGGREGATES(${ifcLabel('rel_storey')},#${b.idOwner},$,$,#${b.idBldg},(#${b.idStorey}));`);
  return lines;
}

// ─── IFC4 Beam-Lines ──────────────────────────────────────────────────────────

function buildBeamLinesIFC4(
  members: TimberMember[],
  beamIdsList: BeamIds[],
  b: BaseIds,
): { lines: string[]; beamIds: number[] } {
  const lines: string[] = [];
  const beamIds: number[] = [];

  members.forEach((m, idx) => {
    const ids = beamIdsList[idx];
    const lengthM = m.length;
    const widthM  = m.width  / 1000;
    const heightM = m.height / 1000;
    const xOffset = 0;
    const yOffset = idx * 1.2;
    const zOffset = 0;
    const matName = ifcMaterialName(m.material || 'C24');
    const role    = ifcBeamType(m.type);

    lines.push(`#${ids.placement3d} = IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((${ifcReal(xOffset)},${ifcReal(yOffset)},${ifcReal(zOffset)})),#${b.idAxisZ},#${b.idAxisX});`);
    lines.push(`#${ids.placement}   = IFCLOCALPLACEMENT(#${b.idStoreyPlace},#${ids.placement3d});`);
    lines.push(`#${ids.profileDef}  = IFCRECTANGLEPROFILEDEF(.AREA.,$,IFCAXIS2PLACEMENT2D(IFCCARTESIANPOINT((0.,0.)),$),${ifcReal(widthM)},${ifcReal(heightM)});`);
    lines.push(`#${ids.extruded}    = IFCEXTRUDEDAREASOLID(#${ids.profileDef},IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,0.)),IFCDIRECTION((0.,1.,0.)),IFCDIRECTION((1.,0.,0.))),IFCDIRECTION((1.,0.,0.)),${ifcReal(lengthM)});`);
    lines.push(`#${ids.shapeRep}    = IFCSHAPEREPRESENTATION(#${b.idWorldCtx},${ifcLabel('Body')},${ifcLabel('SweptSolid')},(#${ids.extruded}));`);
    lines.push(`#${ids.productDef}  = IFCPRODUCTDEFINITIONSHAPE($,$,(#${ids.shapeRep}));`);
    // IFC4: PredefinedType als Enum-Wert im IFCBEAM
    lines.push(`#${ids.beam}        = IFCBEAM(${ifcLabel(m.id)},#${b.idOwner},${ifcLabel(m.name)},${ifcLabel(m.crossSection || `${m.width}x${m.height}`)},$,#${ids.placement},#${ids.productDef},$,.${role}.);`);
    lines.push(`#${ids.material}    = IFCMATERIAL(${ifcLabel(matName)},$,$);`);
    lines.push(`#${ids.matAssoc}    = IFCRELASSOCIATESMATERIAL(${ifcLabel('matassoc_' + idx)},#${b.idOwner},$,$,(#${ids.beam}),#${ids.material});`);
    beamIds.push(ids.beam);
  });

  return { lines, beamIds };
}

// ─── IFC2x3 Beam-Lines ────────────────────────────────────────────────────────

function buildBeamLinesIFC2x3(
  members: TimberMember[],
  beamIdsList: BeamIds[],
  b: BaseIds,
): { lines: string[]; beamIds: number[] } {
  const lines: string[] = [];
  const beamIds: number[] = [];

  members.forEach((m, idx) => {
    const ids = beamIdsList[idx];
    const lengthM = m.length;
    const widthM  = m.width  / 1000;
    const heightM = m.height / 1000;
    const xOffset = 0;
    const yOffset = idx * 1.2;
    const zOffset = 0;
    const matName = ifcMaterialName(m.material || 'C24');

    lines.push(`#${ids.placement3d} = IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((${ifcReal(xOffset)},${ifcReal(yOffset)},${ifcReal(zOffset)})),#${b.idAxisZ},#${b.idAxisX});`);
    lines.push(`#${ids.placement}   = IFCLOCALPLACEMENT(#${b.idStoreyPlace},#${ids.placement3d});`);
    lines.push(`#${ids.profileDef}  = IFCRECTANGLEPROFILEDEF(.AREA.,$,IFCAXIS2PLACEMENT2D(IFCCARTESIANPOINT((0.,0.)),$),${ifcReal(widthM)},${ifcReal(heightM)});`);
    lines.push(`#${ids.extruded}    = IFCEXTRUDEDAREASOLID(#${ids.profileDef},IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,0.)),IFCDIRECTION((0.,1.,0.)),IFCDIRECTION((1.,0.,0.))),IFCDIRECTION((1.,0.,0.)),${ifcReal(lengthM)});`);
    lines.push(`#${ids.shapeRep}    = IFCSHAPEREPRESENTATION(#${b.idWorldCtx},${ifcLabel('Body')},${ifcLabel('SweptSolid')},(#${ids.extruded}));`);
    lines.push(`#${ids.productDef}  = IFCPRODUCTDEFINITIONSHAPE($,$,(#${ids.shapeRep}));`);
    // IFC2x3: IFCBEAM ohne PredefinedType-Argument (IFC2x3 hat kein PredefinedType in IfcBeam)
    lines.push(`#${ids.beam}        = IFCBEAM(${ifcLabel(m.id)},#${b.idOwner},${ifcLabel(m.name)},${ifcLabel(m.crossSection || `${m.width}x${m.height}`)},$,#${ids.placement},#${ids.productDef},$);`);
    // IFC2x3: Material via IfcRelAssociatesMaterial + IfcMaterialLayerSet (kein IfcMaterialProfileSet)
    const matLayerId = nextId();
    const matLayerSetId = nextId();
    lines.push(`#${ids.material}    = IFCMATERIAL(${ifcLabel(matName)});`);
    lines.push(`#${matLayerId}      = IFCMATERIALLAYER(#${ids.material},${ifcReal(widthM)},$);`);
    lines.push(`#${matLayerSetId}   = IFCMATERIALLAYERSET((#${matLayerId}),${ifcLabel(matName)});`);
    lines.push(`#${ids.matAssoc}    = IFCRELASSOCIATESMATERIAL(${ifcLabel('matassoc_' + idx)},#${b.idOwner},$,$,(#${ids.beam}),#${matLayerSetId});`);
    // IFC2x3: Property-Set für Bauteilrolle
    const propId  = nextId();
    const psetId  = nextId();
    const psetRelId = nextId();
    const role = ifcBeamType(m.type);
    lines.push(`#${propId}          = IFCPROPERTYSINGLEVALUE(${ifcLabel('Role')},$,IFCLABEL(${ifcLabel(role)}),$);`);
    lines.push(`#${psetId}          = IFCPROPERTYSET(${ifcLabel('pset_' + idx)},#${b.idOwner},${ifcLabel('Pset_TimberMember')},$,(#${propId}));`);
    lines.push(`#${psetRelId}       = IFCRELDEFINESBYPROPERTIES(${ifcLabel('psetrel_' + idx)},#${b.idOwner},$,$,(#${ids.beam}),#${psetId});`);
    beamIds.push(ids.beam);
  });

  return { lines, beamIds };
}

// ─── STEP-Datei-Wrapper ───────────────────────────────────────────────────────

function wrapStep(
  project: Project,
  schema: 'IFC4' | 'IFC2X3',
  bodyLines: string[],
): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 19);

  const header = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME(${ifcLabel(project.name + '.ifc')},${ifcLabel(dateStr + 'T' + timeStr)},($),($),${ifcLabel(schema)},${ifcLabel('Dachplan-Assistent 1.0')},$);`,
    `FILE_SCHEMA(('${schema}'));`,
    'ENDSEC;',
    'DATA;',
  ].join('\n');

  const footer = ['ENDSEC;', 'END-ISO-10303-21;'].join('\n');
  return header + '\n' + bodyLines.join('\n') + '\n' + footer;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Erzeugt IFC4 STEP-ASCII für SEMA 19+, Allplan, Revit.
 */
export function exportToIFC4(project: Project, members: TimberMember[]): string {
  resetId();
  const b = allocBaseIds();
  const beamIdsList = allocBeamIds(members);
  const baseLines = buildBaseLines(b, project);
  const { lines: beamLines, beamIds } = buildBeamLinesIFC4(members, beamIdsList, b);

  // Außenwände
  const geo = project.geometry;
  const wallThickness = 0.25; // Mauerwerk-Standard, keine wallThickness in BuildingGeometry
  const wallGeo: WallGeometry = {
    length:       geo?.length.value      ?? 10,
    width:        geo?.width.value       ?? 8,
    eavesHeight:  geo?.eavesHeight.value ?? 4,
    wallThickness,
  };
  const { lines: wallLines, wallIds } = buildWallLinesIFC4(wallGeo, b);

  // Multi-Storey wenn ceilings vorhanden
  const extraLines: string[] = [];
  let topStoreyId = b.idStorey;

  if (project.ceilings && project.ceilings.length > 0) {
    const { lines: msLines, storeyIds, relAggId: _relAgg } = buildMultiStoreyLines(
      project.ceilings, b, project.id, b.idOwner, b.idBldg,
    );
    extraLines.push(...msLines);
    // Sparren im obersten Storey (letzter in storeyIds)
    topStoreyId = storeyIds[storeyIds.length - 1].storey;
    // Wände in EG-Storey (ersten Storey)
    const egStoreyId = storeyIds[0].storey;
    extraLines.push(`#${nextId()} = IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcLabel('rel_walls')},#${b.idOwner},$,$,(${wallIds.map(id => `#${id}`).join(',')}),#${egStoreyId});`);
    extraLines.push(`#${nextId()} = IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcLabel('rel_beams')},#${b.idOwner},$,$,(${beamIds.map(id => `#${id}`).join(',')}),#${topStoreyId});`);
  } else {
    const allIds = [...beamIds, ...wallIds].map(id => `#${id}`).join(',');
    extraLines.push(`#${nextId()} = IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcLabel('rel_contains')},#${b.idOwner},$,$,(${allIds}),#${b.idStorey});`);
  }

  return wrapStep(project, 'IFC4', [...baseLines, ...beamLines, ...wallLines, ...extraLines]);
}

/**
 * Erzeugt IFC2x3 STEP-ASCII für SEMA 12-18, AutoCAD Architecture, ArchiCAD.
 *
 * Unterschiede zu IFC4:
 * - FILE_SCHEMA('IFC2X3')
 * - IFCBEAM ohne PredefinedType-Argument
 * - Material über IfcMaterialLayerSet statt IfcMaterialProfileSet
 * - Bauteilrolle in Pset_TimberMember via IFCRELDEFINESBYPROPERTIES
 */
export function exportToIFC2x3(project: Project, members: TimberMember[]): string {
  resetId();
  const b = allocBaseIds();
  const beamIdsList = allocBeamIds(members);
  const baseLines = buildBaseLines(b, project);
  const { lines: beamLines, beamIds } = buildBeamLinesIFC2x3(members, beamIdsList, b);

  // Außenwände
  const geo = project.geometry;
  const wallGeo: WallGeometry = {
    length:       geo?.length.value      ?? 10,
    width:        geo?.width.value       ?? 8,
    eavesHeight:  geo?.eavesHeight.value ?? 4,
    wallThickness: 0.25,
  };
  const { lines: wallLines, wallIds } = buildWallLinesIFC2x3(wallGeo, b);

  // Multi-Storey wenn ceilings vorhanden
  const extraLines: string[] = [];

  if (project.ceilings && project.ceilings.length > 0) {
    const { lines: msLines, storeyIds } = buildMultiStoreyLines(
      project.ceilings, b, project.id, b.idOwner, b.idBldg,
    );
    extraLines.push(...msLines);
    const topStoreyId = storeyIds[storeyIds.length - 1].storey;
    const egStoreyId  = storeyIds[0].storey;
    extraLines.push(`#${nextId()} = IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcLabel('rel_walls')},#${b.idOwner},$,$,(${wallIds.map(id => `#${id}`).join(',')}),#${egStoreyId});`);
    extraLines.push(`#${nextId()} = IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcLabel('rel_beams')},#${b.idOwner},$,$,(${beamIds.map(id => `#${id}`).join(',')}),#${topStoreyId});`);
  } else {
    const allIds = [...beamIds, ...wallIds].map(id => `#${id}`).join(',');
    extraLines.push(`#${nextId()} = IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcLabel('rel_contains')},#${b.idOwner},$,$,(${allIds}),#${b.idStorey});`);
  }

  return wrapStep(project, 'IFC2X3', [...baseLines, ...beamLines, ...wallLines, ...extraLines]);
}

/**
 * Alias für exportToIFC4() – Backward-Kompatibilität.
 */
export function exportToIFC(project: Project, members: TimberMember[]): string {
  return exportToIFC4(project, members);
}

/**
 * Startet Browser-Download IFC4.
 */
export function downloadIFC(project: Project, members: TimberMember[]): void {
  triggerDownload(exportToIFC4(project, members), `${project.name.replace(/[^a-zA-Z0-9-]/g, '_')}_model.ifc`);
}

/**
 * Startet Browser-Download IFC2x3.
 */
export function downloadIFC2x3(project: Project, members: TimberMember[]): void {
  triggerDownload(exportToIFC2x3(project, members), `${project.name.replace(/[^a-zA-Z0-9-]/g, '_')}_model_ifc2x3.ifc`);
}

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/x-step;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
