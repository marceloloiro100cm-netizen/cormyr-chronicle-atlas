1. **`src/lib/house/stacking.ts`**: Update the `stackingBonus` function.
   - Remove the `throw new Error` statements for totals of `2`, `3`, `12`, and `> 18`.
   - Update the expected dice count logic: `const count = total<=3 ? 1 : total<=6 ? 1 : total<=11 ? 2 : total<=18 ? 3 : 3 + Math.ceil((total-18)/6);`.
   - Add handling for totals of 2 or 3 to return `Math.max(1, Math.floor(dice[0]/2))`.

2. **`src/lib/house/fortune.ts`**:
   - In `confirmFortune`: Remove the `throw new Error` on line 26: `if(effects.some(e=>e.kind==='action'&&/ganho|\bG\s|sazon|season/i.test(e.description)))throw new Error('Efeito condicional de ganho exige conciliação antes da rolagem.');`
   - In `convertResources`: Allow an optional `rate` parameter, representing the specific exchange rate. Use it if provided instead of the default `ratio`.
   - Update function signature to: `export function convertResources(state:HouseState,from:Resource,to:Resource,amount:number,rushed:boolean,rate?:number):HouseState {`
   - Use `const ratio = rate ?? (from==='wealth'?(rushed?3:2):(rushed?2:1));`
   - Wait, if we accept `rate`, we must check that the house has an active holding with the `conversion` effect (to prevent arbitrary rates without a feature). We should verify `activeHoldings(state).flatMap(h=>h.effects).some(e=>e.kind==='conversion')`. If rate is provided and there is no conversion effect, maybe throw an error or just fallback to default ratio.

3. **`src/lib/house/house.functions.ts`**:
   - In the `convert` action schema, add `rate: z.number().positive().optional()`.
   - Remove the `throw new Error` checking for `conversion` effects: `if(state.holdings.some(h=>h.status==='active'&&h.effects.some(e=>e.kind==='conversion')))throw new Error('Conversão especial requer conciliação da regra.');`
   - Pass `input.rate` to `convertResources`.

4. **`src/lib/house/engine.ts`**:
   - In `quote`, modify the discounts loop. Instead of `if (discountEffects.length > 1) throw new Error(...)`, calculate `const discountSum = discountEffects.reduce((sum, e) => sum + e.amount, 0);` and apply `cost.amount = Math.max(cost.amount > 0 ? 1 : 0, cost.amount - discountSum);`.
   - Make the same change in `createUnit` for its discounts loop.

5. **Pre-commit**: Complete standard checks.
