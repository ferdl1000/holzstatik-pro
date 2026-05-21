/**
 * Glossar der wichtigsten Fachbegriffe.
 * Wird in Tooltips und im Glossar-Panel angezeigt.
 */

export interface GlossaryEntry {
  term: string;
  short: string;        // Kurzbeschreibung für Tooltip
  long: string;         // Ausführlich für Glossar-Panel
  layman?: string;      // "Erklärt's deiner Oma"-Variante
  formula?: string;
  unit?: string;
  related?: string[];   // andere Begriffe
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  charakteristisch: {
    term: 'Charakteristischer Wert (Index k)',
    short: '5%-Quantil – statistisch nur 5% der Werte liegen darunter.',
    long: 'Bei Materialfestigkeiten: 95 % aller Proben halten mindestens diesen Wert aus. Bei Lasten: maximaler Wert der mit 50-jähriger Wiederkehrperiode auftritt. Index "k" wie "kharakteristisch".',
    layman: 'Der "verlässliche Wert" – nicht Mittelwert, sondern die fast immer eingehaltene Untergrenze.',
  },
  bemessungswert: {
    term: 'Bemessungswert (Index d)',
    short: 'Charakt. Wert mit Sicherheits-Faktoren multipliziert.',
    long: 'f_d = k_mod · f_k / γ_M. So wird zur eigentlichen Festigkeit gerechnet. Mit dem Bemessungswert vergleichen wir die Beanspruchung.',
    layman: 'Die "sichere" Belastungsgrenze – mit Sicherheitsabschlag wegen Unsicherheiten.',
  },
  kmod: {
    term: 'k_mod – Modifikationsbeiwert',
    short: 'Berücksichtigt Lastdauer + Feuchte. Kurze Lasten dürfen höher belasten.',
    long: 'Holz hält kurze Lasten besser aus als dauerhafte (Kriecheffekt). k_mod = 0.6 für Eigengewicht, 0.9 für Schnee, 1.1 für Wind/Stoßlasten. In feuchten Räumen (Nutzungsklasse 3) wird k_mod reduziert.',
    layman: 'Holz kann kurz mal viel Last halten, aber dauerhaft weniger – wie ein Mensch, der 10 Sekunden 100 kg stemmt aber nicht stundenlang.',
  },
  eta: {
    term: 'Ausnutzungsgrad η',
    short: 'Verhältnis Beanspruchung zu zulässiger Festigkeit. η ≤ 1 = OK.',
    long: 'η = Spannung / Festigkeit. Bei η = 0.7 wird das Bauteil zu 70 % ausgenutzt – 30 % Reserve. Bei η > 1.0 versagt der Nachweis rechnerisch.',
    layman: 'Wie voll der Tank ist. 100 % = Limit. Wir wollen drunter bleiben, idealerweise mit Reserve.',
  },
  durchbiegung: {
    term: 'Durchbiegung w',
    short: 'Wie weit ein Träger unter Last nach unten geht.',
    long: 'w_inst = sofort unter Volllast. w_fin = im Endzustand mit Kriechen. Grenzen meist L/300 bzw. L/200 der Stützweite.',
    layman: 'Wenn du dich auf ein Brett setzt, biegt es sich durch. Wir wollen das so klein halten, dass es nicht stört oder Risse im Putz gibt.',
    formula: 'w_inst = 5·q·l⁴/(384·E·I)',
    unit: 'mm',
  },
  knicken: {
    term: 'Knicken',
    short: 'Schlanke Druckstäbe weichen seitlich aus statt zusammengedrückt zu werden.',
    long: 'Wenn ein langes dünnes Holz gedrückt wird, knickt es plötzlich seitlich weg. Der Knickbeiwert k_c reduziert die zulässige Druckfestigkeit.',
    layman: 'Drück ein Lineal an beiden Enden – ab einem Punkt biegt es sich plötzlich weg, statt sich nur zusammenzudrücken. Genauso bei Stützen!',
    formula: 'k_c = 1 / (k + √(k² - λ_rel²))',
  },
  schub: {
    term: 'Schubspannung τ',
    short: 'Spannung "längs" entlang der Faser, max. am Auflager.',
    long: 'Bei Trägern entsteht am Auflager die größte Schubspannung. Holz hat parallel zur Faser nur ~4 N/mm² Schubfestigkeit (im Vergleich zu 24 N/mm² Biegung).',
    layman: 'Stell dir vor, du wolltest einen dicken Stapel Papier durchbiegen – die Blätter würden gegeneinander verrutschen. Genau diese Kraft ist Schub.',
    unit: 'N/mm²',
  },
  querdruck: {
    term: 'Querdruck (Auflagerpressung)',
    short: 'Druck senkrecht zur Holzfaser am Auflager.',
    long: 'Holz ist senkrecht zur Faser ca. 10x schwächer als längs. Bei kleinen Auflagerflächen wird der Querdruck schnell kritisch – Lösung: breitere Auflager oder Stahlplatten.',
    layman: 'Du kannst auf ein liegendes Brett stehen – aber wenn jemand ein Klavier auf ein Brett stellt, drückt sich das in den Träger ein.',
  },
  kippen: {
    term: 'Kippen (laterales Beulen)',
    short: 'Hoher schmaler Träger weicht seitlich aus.',
    long: 'Bei h/b > 4 kann der Träger seitlich umkippen, statt nur durchzubiegen. k_crit reduziert die zulässige Biegespannung.',
    layman: 'Ein Lineal hochkant über einer Lücke – wenn du drauf drückst, kippt es nicht nur durch, sondern auch seitlich weg.',
  },
  schneelast: {
    term: 'Schneelast',
    short: 'Gewicht des Schnees, der auf dem Dach liegen kann.',
    long: 'In Österreich nach ÖNORM B 1991-1-3. Hängt ab von Zone (1-4), Seehöhe und Dachneigung. Bei Salzburg in 800m Höhe rund 200 kg/m².',
    layman: 'Schnee ist nicht "nichts". Frischer Pulverschnee 50 kg/m³, Nassschnee bis 400 kg/m³. Auf 1m² Dach können das schnell 100-250 kg sein.',
    formula: 's = μ · Cₑ · Cₜ · s_k',
    unit: 'kN/m²',
  },
  windlast: {
    term: 'Windlast',
    short: 'Druck + Sog durch Wind. Kann Dach abheben.',
    long: 'ÖNORM B 1991-1-4. Wind drückt von vorne (Druck) und saugt hinten (Sog). In Wien/Burgenland am höchsten in Österreich. Sog ist oft kritischer als Druck wegen Abhebegefahr.',
    layman: 'Wind drückt nicht nur, sondern saugt auch! Wie wenn du Hand aus dem Autofenster hältst – auf der Rückseite Unterdruck. So kann der Wind ganze Dächer anheben.',
    formula: 'w = c_pe · q_p(z)',
  },
  eigengewicht: {
    term: 'Eigengewicht (Ständige Last g)',
    short: 'Gewicht von Konstruktion + Aufbauten.',
    long: 'Permanent vorhanden. Setzt sich zusammen aus Tragwerk + Dachdeckung + Dämmung + Innenausbau. Typisches Ziegeldach mit Dämmung: ~0.8-1.2 kN/m² (80-120 kg/m²).',
  },
  kvh: {
    term: 'KVH (Konstruktionsvollholz)',
    short: 'Getrocknetes, sortiertes Vollholz, meist C24.',
    long: 'Standard-Bauholz für Dachstühle. Maschinell sortiert, getrocknet auf <18 % Feuchte, gefräst. Für sichtbare Bereiche "Si" (Sichtqualität), sonst "NSi".',
    layman: 'Das normale Bauholz – Latte, Sparren, Pfette. Direkt vom Sägewerk.',
  },
  bsh: {
    term: 'BSH / Brettschichtholz / Leimbinder',
    short: 'Aus Lamellen verleimtes Holz, höhere Festigkeit + längere Spannweiten.',
    long: 'Mehrere getrocknete Lamellen werden verleimt. Vorteile: höhere Festigkeit (GL24-GL32), keine Längenbegrenzung wie bei Vollholz, kann gebogen produziert werden. Für Hallen, große Wohnzimmer, stützenfreie Räume.',
    layman: 'Wenn du 25 m überspannen willst ohne eine Stütze in der Mitte, brauchst du BSH. Geht mit normalem Holz nicht – ist auch schöner zu sehen.',
  },
  uls: {
    term: 'ULS (Tragfähigkeit, Grenzzustand)',
    short: 'Nachweis gegen Versagen / Bruch.',
    long: '"Ultimate Limit State". Mit Sicherheitsfaktoren – wir prüfen ob das Bauteil unter ungünstigster Last sicher bleibt.',
  },
  sls: {
    term: 'SLS (Gebrauchstauglichkeit)',
    short: 'Nachweis gegen Verformungen, Risse, Schwingungen.',
    long: '"Serviceability Limit State". Ohne Sicherheitsfaktoren – wir prüfen wie das Bauteil im normalen Betrieb funktioniert (z.B. dass Durchbiegung nicht stört).',
  },
  sparren: {
    term: 'Sparren',
    short: 'Schräge Hauptbalken des Daches, von First zu Traufe.',
    long: 'Tragen die Dachdeckung, Lattung, Dämmung. Üblicher Abstand 70-90 cm. Querschnitt typisch 8/16 bis 10/22 cm in C24.',
  },
  pfette: {
    term: 'Pfette',
    short: 'Horizontaler Träger parallel zum First.',
    long: 'Stützt Sparren ab. Firstpfette ganz oben, Mittelpfette mittig, Fußpfette unten an Mauerwerk. Bei Pfettendach trägt sie die Hauptlast.',
  },
  zange: {
    term: 'Zange / Kehlbalken',
    short: 'Horizontaler Querverbinder, der Sparren zusammenhält.',
    long: 'Verhindert dass Sparrenfüße auseinanderdrücken. Wird auf Zug oder Druck beansprucht. Typisch bei Kehlbalkendach.',
  },
};

export function lookup(termKey: string): GlossaryEntry | undefined {
  return GLOSSARY[termKey.toLowerCase()];
}
