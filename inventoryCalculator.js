/* NOTE THAT THIS SCRIPT REQUIRES PANEL ACCESS TO WORK PROPERLY */

(async () => {
  /* ================= CONFIG ================= */
  const TARGET_PRICES = 25;      // <<< HUGE SPEED WIN
  const MAX_PAGES = 4;
  const MAX_RETRIES = 3;
  const REQUEST_DELAY = 120;
  const RETRY_DELAY = 400;
  const CONCURRENCY = 4;
  /* ========================================== */

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const priceCache = new Map();

  const username = prompt("Enter username to calculate inventory value:");
  if (!username) return;

  const userData = await (await fetch(`/worker2/user/${encodeURIComponent(username)}`)).json();
  if (userData.error) return console.error("User not found.");

  const inventory = userData.user.blooks;
  const meta = await (await fetch("/data/index.json")).json();
  const blookMeta = meta.blooks;

  const RARITY_PRICES = {
    Uncommon: 5,
    Rare: 20,
    Epic: 75,
    Legendary: 200
  };

  async function getAveragePrice(blookName) {
    if (priceCache.has(blookName)) return priceCache.get(blookName);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 90;
        let prices = [];
        let page = 1;
        let lastMedian = null;

        while (page <= MAX_PAGES && prices.length < TARGET_PRICES) {
          const res = await fetch(
            `/worker/staff/audit/${page}` +
            `?action=${encodeURIComponent(JSON.stringify(["bazaar","bought"]))}` +
            `&user=undefined&search=${encodeURIComponent(`"${blookName}"`)}`
          );
          if (!res.ok) break;

          const data = await res.json();
          if (!data.audit?.length) break;

          for (const entry of data.audit) {
            if (entry.date < cutoff) break;

            const match = entry.reason.match(/for\s+(\d+)\s+tokens/i);
            if (match) prices.push(+match[1]);
          }

          if (page >= 2 && prices.length < 5) break;

          if (prices.length >= 10) {
            const sorted = [...prices].sort((a,b)=>a-b);
            const median = sorted[Math.floor(sorted.length / 2)];
            if (median === lastMedian) break;
            lastMedian = median;
          }

          page++;
          await sleep(REQUEST_DELAY);
        }

        if (!prices.length) throw "No data";

        prices.sort((a,b)=>a-b);

        const q1 = prices[Math.floor(prices.length * 0.25)];
        const q3 = prices[Math.floor(prices.length * 0.75)];
        const iqr = q3 - q1;
        const low = q1 - 1.5 * iqr;
        const high = q3 + 1.5 * iqr;

        const clean = prices.filter(p => p >= low && p <= high);
        const base = clean.length ? clean : prices;

        const avg = Math.round(base.reduce((a,b)=>a+b,0) / base.length);
        priceCache.set(blookName, avg);
        return avg;

      } catch {
        await sleep(RETRY_DELAY);
      }
    }

    priceCache.set(blookName, null);
    return null;
  }

  const entries = Object.entries(inventory).filter(([,v]) => v > 0);
  let results = [];
  let failed = [];

  async function worker(queue) {
    while (queue.length) {
      const [blook, amount] = queue.shift();
      const info = blookMeta[blook];
      if (!info) { failed.push(blook); continue; }

      let unit;
      if (RARITY_PRICES[info.rarity]) {
        unit = RARITY_PRICES[info.rarity];
      } else {
        unit = await getAveragePrice(blook);
        if (unit === null) { failed.push(blook); continue; }
      }

      results.push({
        blook,
        rarity: info.rarity,
        amount,
        unitPrice: unit,
        totalValue: unit * amount
      });

      console.log(`✔ ${blook}`);
    }
  }

  const queue = [...entries];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker(queue))
  );

  const total = results.reduce((s,r)=>s+r.totalValue,0);

  console.table(results);
  console.log(
    `TOTAL INVENTORY VALUE for ${userData.user.username}:`,
    total.toLocaleString(),
    "tokens"
  );

  if (failed.length) console.warn("Failed:", failed);
})();
