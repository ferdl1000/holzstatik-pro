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
