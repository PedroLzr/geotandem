import { randomInt, randomUUID } from 'node:crypto';
import countries from '../data/countries.json';
import assetsJson from '../data/assets.json';
import type { Option } from '../shared/types';
import { locationCountries } from './geography';
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
export function generateQuestions(withLocation = false): Question[][] {
  const phases: Question[][] = [0, 1, 2].map((phase) => {
    const pool = countries.filter((c) =>
      phase === 0 ? c.shapeEligible : phase === 1 ? c.flagEligible : c.capitalEligible,
    );
    return shuffle(pool)
      .slice(0, 10)
      .map((country) => {
        const others = pool.filter((c) => c.code !== country.code);
        const distractors = [
          ...shuffle(others.filter((c) => c.region === country.region)),
          ...shuffle(others.filter((c) => c.region !== country.region)),
        ].slice(0, 5);
        const answers = shuffle([country, ...distractors]);
        const options = answers.map((c) => ({
          id: randomUUID(),
          text: phase === 2 ? c.capital : c.name,
        }));
        const raw = phase === 0 ? assets[country.code].shape : assets[country.code].flag;
        return {
          id: randomUUID(),
          country: country.code,
          prompt:
            phase === 2
              ? `What is the capital of ${country.name}?`
              : phase === 0
                ? 'What country is this?'
                : 'Which country does this flag belong to?',
          visual:
            phase < 2
              ? `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}`
              : undefined,
          options,
          correctOptionId: options[answers.indexOf(country)].id,
        };
      });
  });
  if (withLocation)
    phases.push(
      shuffle(locationCountries)
        .slice(0, 10)
        .map((country) => ({
          id: randomUUID(),
          kind: 'location',
          country: country.code,
          prompt: `Locate ${country.name}`,
          options: [],
          correctOptionId: '',
        })),
    );
  return phases;
}
