// =========================================================
// scoring.js: pure functions that turn everyone's picks into
// recommendations. No DOM or Firebase here, so it's easy to tweak.
// =========================================================

/**
 * Turn any label into a simple ID: "Disney Springs" -> "disney-springs".
 */
export function slug(name) {
  return String(name).toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Cuisine ID used for storage and matching. Forgiving about spelling, so
 * "Burger" / "Burgers" / "burgers" and "Salad" / "Salads" all count as the
 * same cuisine. (It drops a single trailing "s".)
 */
export function cuisineId(name) {
  return slug(name).replace(/([^s])s$/, "$1");
}

/** "bar-food" -> "Bar Food". Names that already have capitals are left alone. */
function prettyName(name) {
  const s = String(name).trim();
  if (s !== s.toLowerCase()) return s;
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A restaurant's location(s) as a list of area IDs ("location" can be text or a list). */
export function restaurantAreas(restaurant) {
  const loc = restaurant.location;
  const list = Array.isArray(loc) ? loc : loc ? [loc] : [];
  return list.filter(Boolean).map(slug);
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
      const pretty = prettyName(name);
      // If spellings differ ("Burger" vs "Burgers"), show the longer one on the button.
      if (id && (!byId.has(id) || pretty.length > byId.get(id).name.length)) byId.set(id, { id, name: pretty });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build the list of area buttons: the "areas" list from restaurants.json,
 * plus any other location a restaurant uses.
 * @returns {Array<{id:string, name:string}>} sorted A→Z
 */
export function areasFromData(areaNames, restaurants) {
  const byId = new Map();
  const add = (name) => {
    const id = slug(name);
    if (id && !byId.has(id)) byId.set(id, { id, name: prettyName(name) });
  };
  (areaNames || []).forEach(add);
  for (const r of restaurants) {
    const loc = r.location;
    (Array.isArray(loc) ? loc : loc ? [loc] : []).forEach(add);
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
 * Does this restaurant work for this person?
 *  - it serves at least one cuisine they picked, AND
 *  - it's in an area they're willing to go to.
 * Someone who picked no areas is fine going anywhere. A restaurant with no
 * "location" yet is never ruled out by area.
 */
function worksFor(person, cuisineIds, areaIds) {
  const cuisineOk = person.cuisines.some((c) => cuisineIds.includes(c));
  const areas = person.areas || [];
  const areaOk = areas.length === 0 || areaIds.length === 0 || areaIds.some((a) => areas.includes(a));
  return cuisineOk && areaOk;
}

/**
 * Rank restaurants by how many people they'd satisfy (see worksFor).
 * Ties are broken by:
 *   1. total votes for the restaurant's cuisines (more overlap wins)
 *   2. name, A→Z (so results are stable)
 *
 * @param {Array} restaurants  from restaurants.json
 * @param {Array<{name:string, cuisines:string[], areas?:string[]}>} participants
 * @param {number} limit       max results to return
 * @returns {Array<{restaurant:object, satisfied:string[], score:number}>}
 */
export function rankRestaurants(restaurants, participants, limit = 5) {
  const tally = new Map(tallyCuisines(participants).map((t) => [t.id, t.count]));

  return restaurants
    .map((restaurant) => {
      const ids = [...new Set(restaurant.cuisines.map(cuisineId))];
      const areaIds = restaurantAreas(restaurant);
      const satisfied = participants.filter((p) => worksFor(p, ids, areaIds)).map((p) => p.name);
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
