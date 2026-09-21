import type { PlayerView } from './types';

// Group ties relative to the fastest player in each score group, avoiding
// a non-transitive comparator for the existing 10 ms tie tolerance.
export function arenaRanking(players: PlayerView[]) {
  const sorted = [...players].sort(
    (a, b) => b.stats.correct - a.stats.correct || a.stats.averageMs - b.stats.averageMs,
  );
  let leader: PlayerView | undefined;
  let rank = 0;
  return sorted.map((player, index) => {
    if (
      !leader ||
      player.stats.correct !== leader.stats.correct ||
      player.stats.averageMs - leader.stats.averageMs >= 10
    ) {
      leader = player;
      rank = index + 1;
    }
    return { player, rank };
  });
}
