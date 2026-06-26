/**
 * Große Einreichpläne (z.B. 1 Blatt mit ~10 Megapixel, 9 MB) sprengen das Memory-/
 * Zeit-Limit der Supabase-Edge-Function (WORKER_RESOURCE_LIMIT / 150s-Timeout), wenn
 * sie als rohes PDF an Gemini Vision gehen. Diese Utility rendert solche Pläne im
 * Browser auf eine begrenzte Auflösung herunter und liefert ein kompaktes JPEG,
 * das die KI zuverlässig in <150s lesen kann.
 *
 * FAIL-SAFE: Bei kleinen Dateien ODER jedem Fehler wird `null` zurückgegeben →
 * der Aufrufer lädt dann einfach die Original-Datei hoch (kein Regressionsrisiko
 * für die bereits funktionierenden Normal-Pläne).
 */
/**
 * WICHTIG: pdfjs-dist wird NUR dynamisch (lazy) geladen — niemals statisch.
 * pdfjs 4.x nutzt sehr neue Browser-APIs (Promise.withResolvers); ein statischer
 * Import würde die ganze App schon beim Laden in älteren Browsern crashen lassen
 * (weißer Bildschirm). Lazy geladen wird es nur, wenn wirklich ein großer Plan
 * heruntergerechnet wird — und Fehler werden abgefangen (Original-Upload).
 */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = (workerMod as { default: string }).default;
      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}

/** Ab dieser Dateigröße wird heruntergerechnet. Kleinere PDFs bleiben unangetastet. */
export const DOWNSAMPLE_THRESHOLD_BYTES = 4.5 * 1024 * 1024;

/** Längere Kante pro Planseite nach dem Rendern (px). Genug für Beschriftungen. */
const MAX_EDGE_PX = 2400;
const JPEG_QUALITY = 0.82;

export interface DownsampleResult {
  blob: Blob;
  fileName: string;
  mimeType: 'image/jpeg';
  pages: number;
}

/**
 * Liefert ein verkleinertes JPEG für ein großes PDF — oder null, wenn das PDF
 * klein genug ist oder etwas schiefgeht (dann Original hochladen).
 */
export async function downsamplePdfIfLarge(file: File): Promise<DownsampleResult | null> {
  try {
    if (!file || file.type !== 'application/pdf') return null;
    if (file.size < DOWNSAMPLE_THRESHOLD_BYTES) return null;

    const pdfjsLib = await loadPdfjs();
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const nPages = Math.min(pdf.numPages, 6); // Sicherheitskappe gegen riesige Mehrseiter

    // Jede Seite rendern und vertikal stapeln (kein Info-Verlust bei Mehrseitern).
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= nPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_EDGE_PX / Math.max(base.width, base.height), 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      canvases.push(canvas);
    }
    if (canvases.length === 0) return null;

    // Zusammensetzen
    const width = Math.max(...canvases.map((c) => c.width));
    const height = canvases.reduce((s, c) => s + c.height, 0) + (canvases.length - 1) * 8;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, width, height);
    let y = 0;
    for (const c of canvases) {
      octx.drawImage(c, 0, y);
      y += c.height + 8;
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return null; // kein Gewinn → Original

    const baseName = file.name.replace(/\.pdf$/i, '');
    return { blob, fileName: `${baseName}.jpg`, mimeType: 'image/jpeg', pages: nPages };
  } catch (err) {
    console.warn('[downsamplePdfIfLarge] Fehler — Original wird verwendet:', err);
    return null;
  }
}

/**
 * Liest die TEXT-EBENE eines PDFs clientseitig aus (pdf.js getTextContent).
 * Viele Einreichpläne haben echten, selektierbaren Text — dann brauchen wir die KI
 * für DN/Maße/Codes/Adressen GAR NICHT (deterministisch + kontingent-frei).
 * Liefert '' bei reinen Bild-/Scan-Plänen (dann übernimmt die KI-Vision).
 */
export async function extractPdfText(file: File, maxPages = 4): Promise<string> {
  try {
    if (!file || file.type !== 'application/pdf') return '';
    const pdfjsLib = await loadPdfjs();
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const n = Math.min(pdf.numPages, maxPages);
    const parts: string[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const txt = (content.items as Array<{ str?: string }>).map((it) => it.str || '').join(' ');
      if (txt.trim()) parts.push(txt);
    }
    return parts.join('\n').replace(/\s{3,}/g, '  ').trim();
  } catch (err) {
    console.warn('[extractPdfText] Fehler — KI-Vision übernimmt:', err);
    return '';
  }
}

/**
 * Clientseitiges OCR für gescannte/Bild-Pläne OHNE Text-Ebene (z.B. Lechner).
 * Nutzt Tesseract.js (reine Browser-Bibliothek, KEIN API/Kontingent). Rendert die
 * Seite(n) und erkennt deutschen Text → DN, Maße, ÜBERDACHUNG etc. werden auch bei
 * Scan-Plänen kontingent-frei lesbar. Lazy geladen + fail-safe (''-Rückgabe).
 */
export async function ocrPdf(file: File, maxTiles = 8, onProgress?: (p: number) => void): Promise<string> {
  try {
    if (!file || file.type !== 'application/pdf') return '';
    const pdfjsLib = await loadPdfjs();
    const { createWorker } = await import('tesseract.js');
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const nPages = Math.min(pdf.numPages, 2);

    // WICHTIG: OCR auf dem GANZEN Blatt liefert Müll (Text zu klein). Stattdessen
    // das Blatt hochauflösend rendern (lange Kante ~5000 px) und in Kacheln OCR'n —
    // dann ist der Text groß genug. So werden DN/Maße/ÜBERDACHUNG auch bei Scans lesbar.
    const canvases: HTMLCanvasElement[] = [];
    for (let p = 1; p <= nPages && canvases.length < maxTiles; p++) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(5000 / Math.max(base.width, base.height), 6);
      const vp = page.getViewport({ scale });
      const full = document.createElement('canvas');
      full.width = Math.ceil(vp.width); full.height = Math.ceil(vp.height);
      const fctx = full.getContext('2d');
      if (!fctx) continue;
      fctx.fillStyle = '#ffffff'; fctx.fillRect(0, 0, full.width, full.height);
      await page.render({ canvasContext: fctx, viewport: vp }).promise;
      const cols = Math.max(1, Math.round(full.width / 1700));
      const rows = Math.max(1, Math.round(full.height / 1700));
      const cw = Math.floor(full.width / cols), ch = Math.floor(full.height / rows);
      for (let r = 0; r < rows && canvases.length < maxTiles; r++) {
        for (let c = 0; c < cols && canvases.length < maxTiles; c++) {
          const tile = document.createElement('canvas');
          tile.width = cw; tile.height = ch;
          const tctx = tile.getContext('2d');
          if (!tctx) continue;
          tctx.drawImage(full, c * cw, r * ch, cw, ch, 0, 0, cw, ch);
          canvases.push(tile);
        }
      }
    }
    if (canvases.length === 0) return '';

    const worker = await createWorker('deu');
    const out: string[] = [];
    for (let i = 0; i < canvases.length; i++) {
      const { data: res } = await worker.recognize(canvases[i]);
      if (res?.text?.trim()) out.push(res.text);
      onProgress?.(Math.round((i + 1) / canvases.length * 100));
    }
    await worker.terminate();
    return out.join('\n').trim();
  } catch (err) {
    console.warn('[ocrPdf] Fehler — übersprungen:', err);
    return '';
  }
}

/**
 * Liefert den Plan-Text: erst die echte Text-Ebene (schnell, exakt); wenn die fehlt
 * (Scan-Plan), clientseitiges OCR. So bekommen ALLE Plantypen kontingent-frei Text.
 */
export async function extractOrOcrText(file: File, onOcr?: (p: number) => void): Promise<{ text: string; method: 'textlayer' | 'ocr' | 'none' }> {
  const layer = await extractPdfText(file);
  if (layer && layer.replace(/\s/g, '').length > 60) return { text: layer, method: 'textlayer' };
  const ocr = await ocrPdf(file, 8, onOcr);
  // STRENGES Qualitäts-Gate: OCR auf dichten Plänen ist oft verrauscht (Zeichnungs-
  // linien werden als Buchstaben gelesen). Nur übernehmen, wenn der DETERMINISTISCHE
  // Parser echtes Signal findet (DN-Marker ODER mehrere klare Fakten) — sonst lieber
  // gar nichts speichern und der KI-Vision überlassen (verlässlicher bei Scans).
  if (ocr && ocr.replace(/\s/g, '').length > 40) {
    try {
      const { parseAllFacts } = await import('../../../supabase/functions/_shared/textParser');
      const f = parseAllFacts(ocr);
      const strong = f.dnMarkers.length >= 1
        || (f.dimensions.length + Number(f.ueberdachungCount) + f.aufbautenCodes.length >= 3 && f.coveringHints.length >= 1);
      if (strong) return { text: ocr, method: 'ocr' };
    } catch { /* Parser-Import fehlgeschlagen → OCR verwerfen */ }
  }
  return { text: '', method: 'none' };
}

// ─── Kachel-Analyse (Teilabschnitte) ────────────────────────────────────────
export interface PlanTile {
  blob: Blob;
  fileName: string;
  mimeType: 'image/jpeg';
  /** Position der Kachel im Plan (für Merge/Debug). */
  page: number; col: number; row: number;
}

/** Lange Kante, auf die die Seite VOR dem Kacheln HOCHskaliert wird (Detail erhalten!). */
const TILE_SOURCE_EDGE_PX = 6000;
/** Jede fertige Kachel wird auf max. diese Kantenlänge heruntergerechnet. */
const TILE_CAP_PX = 2400;
/** Überlappung zwischen Kacheln, damit nichts an der Grenze zerschnitten wird. */
const TILE_OVERLAP = 0.06;

/**
 * Wählt eine Rasterung (Spalten×Zeilen) mit MAX 6 Kacheln, die den GANZEN Plan abdeckt,
 * passend zum Seitenverhältnis. So bleibt selbst ein riesiges Planblatt vollständig
 * erfasst (kein abgeschnittener Bereich) und jede Kachel ist groß genug zum Lesen.
 */
function pickTileGrid(aspect: number): { cols: number; rows: number } {
  if (aspect >= 1.2) return { cols: 3, rows: 2 };  // quer/breit (Standard-Plan)
  if (aspect >= 0.8) return { cols: 2, rows: 2 };  // quadratisch
  return { cols: 2, rows: 3 };                       // hoch
}

/**
 * Rendert einen Plan in ÜBERLAPPENDE, hochauflösende Kacheln, die ZUSAMMEN den GANZEN
 * Plan abdecken. Wichtig: erst hochauflösend rendern (Detail!), DANN schneiden — nicht
 * vorher herunterrechnen. Jede Kachel ist klein genug, dass die KI winzige Beschriftungen
 * (DN, Maße, Codes) sicher liest. Fail-safe: null bei Fehler.
 */
export async function renderPdfToTiles(file: File, _maxTiles = 6): Promise<PlanTile[] | null> {
  try {
    if (!file || file.type !== 'application/pdf') return null;
    const pdfjsLib = await loadPdfjs();
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const nPages = Math.min(pdf.numPages, 2);
    const tiles: PlanTile[] = [];

    for (let p = 1; p <= nPages; p++) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      // HOCH rendern → Detail bleibt erhalten (lange Kante bis 6000 px).
      const scale = Math.min(TILE_SOURCE_EDGE_PX / Math.max(base.width, base.height), 5);
      const vp = page.getViewport({ scale });
      const full = document.createElement('canvas');
      full.width = Math.ceil(vp.width);
      full.height = Math.ceil(vp.height);
      const fctx = full.getContext('2d');
      if (!fctx) return null;
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(0, 0, full.width, full.height);
      await page.render({ canvasContext: fctx, viewport: vp }).promise;

      const { cols, rows } = pickTileGrid(full.width / full.height);
      const cellW = full.width / cols;
      const cellH = full.height / rows;
      const ovX = cellW * TILE_OVERLAP;
      const ovY = cellH * TILE_OVERLAP;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = Math.max(0, c * cellW - ovX);
          const sy = Math.max(0, r * cellH - ovY);
          const sw = Math.min(full.width - sx, cellW + 2 * ovX);
          const sh = Math.min(full.height - sy, cellH + 2 * ovY);
          // Kachel auf TILE_CAP_PX herunterrechnen (schnelle KI-Lesung, kleine Payload).
          const tScale = Math.min(TILE_CAP_PX / Math.max(sw, sh), 1);
          const tile = document.createElement('canvas');
          tile.width = Math.ceil(sw * tScale);
          tile.height = Math.ceil(sh * tScale);
          const tctx = tile.getContext('2d');
          if (!tctx) continue;
          tctx.fillStyle = '#ffffff';
          tctx.fillRect(0, 0, tile.width, tile.height);
          tctx.drawImage(full, sx, sy, sw, sh, 0, 0, tile.width, tile.height);
          const blob = await new Promise<Blob | null>((res) => tile.toBlob((b) => res(b), 'image/jpeg', 0.82));
          if (blob) {
            const baseName = file.name.replace(/\.pdf$/i, '');
            tiles.push({ blob, fileName: `${baseName}_p${p}_r${r}c${c}.jpg`, mimeType: 'image/jpeg', page: p, col: c, row: r });
          }
        }
      }
      // Nur Seite 1 kacheln, wenn sie schon ≥4 Kacheln ergab (Mehrseiter selten relevant).
      if (tiles.length >= 4) break;
    }
    return tiles.length >= 2 ? tiles : null;
  } catch (err) {
    console.warn('[renderPdfToTiles] Fehler — Kachelung übersprungen:', err);
    return null;
  }
}
