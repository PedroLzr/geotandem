import { randomInt, randomUUID } from 'node:crypto';
import countries from '../data/countries.json';
import assetsJson from '../data/assets.json';
import type { Option } from '../shared/types';
export interface Question {
  kind?: 'location';
  id: string;
  prompt: string;
  visual?: string;
  options: Option[];
  correctOptionId: string;
  country: string;
}
const assets: Record<string, { shape: string; flag: string }> = assetsJson;
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export type Phase = 0 | 1 | 2 | 3;
export type Country = (typeof countries)[number];

// One catalog for every phase and every game mode: no eligibility exclusions.
export function questionForCountry(country: Country, phase: Phase): Question {
  if (phase === 3) {
    return {
      id: randomUUID(),
      kind: 'location',
      country: country.code,
      prompt: `Locate ${country.name}`,
      options: [],
      correctOptionId: '',
    };
  }
  const label = (c: Country) => (phase === 2 ? c.capital : c.name);
  const others = countries.filter((c) => c.code !== country.code && label(c) !== label(country));
  const candidates = [
    ...shuffle(others.filter((c) => c.region === country.region)),
    ...shuffle(others.filter((c) => c.region !== country.region)),
  ];
  // Distinct labels avoid two indistinguishable answers if capital names coincide.
  const seen = new Set<string>();
  const distractors = candidates
    .filter((c) => {
      if (seen.has(label(c))) return false;
      seen.add(label(c));
      return true;
    })
    .slice(0, 5);
  if (distractors.length !== 5) throw new Error(`Not enough distinct answers: ${country.code}`);
  const answers = shuffle([country, ...distractors]);
  const options = answers.map((c) => ({ id: randomUUID(), text: label(c) }));
  const raw =
    phase === 0
      ? assets[country.code]?.shape
      : phase === 1
        ? assets[country.code]?.flag
        : undefined;
  if (phase < 2 && !raw) throw new Error(`Missing visual: ${country.code}`);
  return {
    id: randomUUID(),
    country: country.code,
    prompt:
      phase === 2
        ? country.capitalQuestion
        : phase === 0
          ? 'What country is this?'
          : 'Which country does this flag belong to?',
    visual: raw ? `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}` : undefined,
    options,
    correctOptionId: options[answers.indexOf(country)].id,
  };
}

export function generateQuestions(): Question[][] {
  return ([0, 1, 2, 3] as const).map((phase) =>
    shuffle(countries)
      .slice(0, 10)
      .map((country) => questionForCountry(country, phase)),
  );
}
