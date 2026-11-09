// =========================================================
// scoring.js: pure functions that turn everyone's picks into
// recommendations. No DOM or Firebase here, so it's easy to tweak.
// =========================================================

/**
 * Turn a cuisine name into a stable ID used for storage and matching.
 * "Middle Eastern" -> "middle-eastern", "Sushi" -> "sushi"
 */
export function cuisineId(name) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Build the list of cuisines to show as buttons, taken from the
 * restaurant data, so adding a restaurant with a new cuisine
 * automatically adds that cuisine to the picker.
 * @returns {Array<{id:string, name:string}>} sorted A→Z
 */
export function cuisinesFromRestaurants(restaurants) {
  const byId = new Map();
  for (const r of restaurants) {
    for (const name of r.cuisines) {
      const id = cuisineId(name);
      if (!byId.has(id)) byId.set(id, { id, name });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Count how many people picked each cuisine.
 * @param {Array<{cuisines:string[]}>} participants
 * @returns {Array<{id:string, count:number}>} most popular first
 */
export function tallyCuisines(participants) {
  const counts = new Map();
  for (const p of participants) {
    for (const id of p.cuisines) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * Rank restaurants by how many people they'd satisfy.
 *
 * A person is "satisfied" by a restaurant if it serves at least one
 * cuisine they picked. Ties are broken by:
 *   1. total votes for the restaurant's cuisines (more overlap wins)
 *   2. name, A→Z (so results are stable)
 *
 * @param {Array} restaurants  from restaurants.json
 * @param {Array<{name:string, cuisines:string[]}>} participants
 * @param {number} limit       max results to return
 * @returns {Array<{restaurant:object, satisfied:string[], score:number}>}
 */
export function rankRestaurants(restaurants, participants, limit = 5) {
  const tally = new Map(tallyCuisines(participants).map((t) => [t.id, t.count]));

  return restaurants
    .map((restaurant) => {
      const ids = restaurant.cuisines.map(cuisineId);
      const satisfied = participants
        .filter((p) => p.cuisines.some((c) => ids.includes(c)))
        .map((p) => p.name);
      const votes = ids.reduce((sum, id) => sum + (tally.get(id) || 0), 0);
      return { restaurant, satisfied, score: satisfied.length, votes };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.votes - a.votes ||
        a.restaurant.name.localeCompare(b.restaurant.name),
    )
    .slice(0, limit);
}
