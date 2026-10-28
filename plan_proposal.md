1. **Analyze the Inefficiencies**:
    - The current `pendingRoundHouses` code has expensive inner loops and filtering:
      - `playerFor` uses `activePlayers.find` - linear scan (O(P))
      - `housesFor` uses `members.filter` - linear scan (O(M))
      - `activePlayers.filter` inside the `for (const [houseId, ...] of latest)` loop recalculates eligible players for each target house of every letter.
      - `answers.some` contains `eligible.some`.
    - These linear arrays can be pre-indexed using `Map`s for O(1) lookups.

2. **Propose Optimizations**:
    - Build a mapping of `userId` -> `RoundPlayer` and `playerId` -> `RoundPlayer` upfront to optimize `playerFor`.
    - Build a mapping of `playerId` -> `string[]` (list of `house_id`s) upfront to optimize `housesFor`.
    - Build a mapping of `houseId` -> `RoundPlayer[]` (list of active players belonging to the house) upfront to optimize `activePlayers.filter(p => housesFor(p).includes(houseId))`.

3. **Refactor `pendingRoundHouses`**:
    - Setup indexes before iterating over `letters`.
    - `activePlayers`: `players.filter(p => p.active && p.user_id)`
    - `playerById`, `playerByUserId`: Maps for quick lookup.
    - `housesByPlayerId`: Map of playerId to Array of houseIds.
    - `playersByHouseId`: Map of houseId to Array of active RoundPlayers.

    ```typescript
    const activePlayers = players.filter(p => p.active && p.user_id);
    const playerById = new Map<string, RoundPlayer>();
    const playerByUserId = new Map<string, RoundPlayer>();
    for (const p of activePlayers) {
      playerById.set(p.id, p);
      if (p.user_id) playerByUserId.set(p.user_id, p);
    }

    const housesByPlayerId = new Map<string, string[]>();
    for (const m of members) {
      let h = housesByPlayerId.get(m.player_id);
      if (!h) { h = []; housesByPlayerId.set(m.player_id, h); }
      h.push(m.house_id);
    }

    const playersByHouseId = new Map<string, RoundPlayer[]>();
    for (const p of activePlayers) {
      const p_houses = housesByPlayerId.get(p.id) || [];
      for (const h of p_houses) {
        let ph = playersByHouseId.get(h);
        if (!ph) { ph = []; playersByHouseId.set(h, ph); }
        ph.push(p);
      }
    }

    const playerFor = (id: string | null | undefined, userId?: string) => {
      if (id) {
        const p = playerById.get(id);
        if (p) return p;
      }
      if (userId) {
        return playerByUserId.get(userId);
      }
      return undefined;
    };

    const housesFor = (player: RoundPlayer | undefined) => player ? (housesByPlayerId.get(player.id) || []) : [];
    ```

    - Then update the `for (const [houseId, lastNarrative] of latest)` loop:
    ```typescript
    const eligible = playersByHouseId.get(houseId);
    if (!eligible || !eligible.length) continue;

    // Create a Set of eligible player IDs and User IDs for O(1) checking
    // Actually, creating a Set inside might be slow. Or we can just use a Set per house upfront.
    ```
    - We can pre-calculate `eligible` player conditions inside `playersByHouseId` as Sets of player IDs and user IDs.
    ```typescript
    const eligiblePlayerIdsByHouse = new Map<string, Set<string>>();
    const eligibleUserIdsByHouse = new Map<string, Set<string>>();
    for (const [houseId, ps] of playersByHouseId.entries()) {
      const pIds = new Set<string>();
      const uIds = new Set<string>();
      for (const p of ps) {
        pIds.add(p.id);
        if (p.user_id) uIds.add(p.user_id);
      }
      eligiblePlayerIdsByHouse.set(houseId, pIds);
      eligibleUserIdsByHouse.set(houseId, uIds);
    }
    ```
    - Inside the loop:
    ```typescript
    const pIds = eligiblePlayerIdsByHouse.get(houseId);
    const uIds = eligibleUserIdsByHouse.get(houseId);
    if (!pIds || pIds.size === 0) continue;
    const answered = answers.some(r => r.delivery_week === week &&
      (pIds.has(r.author_player_id as string) || (r.author_user_id && uIds.has(r.author_user_id))) &&
      (r.delivered_at ?? r.created_at ?? '') >= lastNarrative
    );
    ```

4. **Verify Correctness & Performance**:
    - Run the baseline script `perf_test.ts` to ensure it's significantly faster.
    - Run `vitest` to ensure no tests break.

5. **Pre-commit Instructions**:
    - Follow pre-commit instructions before submitting.
