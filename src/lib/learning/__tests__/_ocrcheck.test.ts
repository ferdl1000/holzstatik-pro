import { describe, it } from 'vitest';
import { readFileSync } from 'fs'; import { join } from 'path';
import { parseAllFacts } from '../../../../supabase/functions/_shared/textParser';
describe('OCR2', () => { it('d', () => {
  const t = readFileSync(join(__dirname, '_ocr_fixture.txt'), 'utf-8');
  const f = parseAllFacts(t);
  console.log('DNMARK=' + JSON.stringify(f.dnMarkers.map(m=>m.value)));
  console.log('UEBER=' + f.ueberdachungCount + ' DIMS=' + f.dimensions.length + ' COV=' + JSON.stringify(f.coveringHints.map(c=>c.type)));
  console.log('SIGNAL=' + (f.dnMarkers.length + f.dimensions.length + f.ueberdachungCount + f.aufbautenCodes.length));
}); });
