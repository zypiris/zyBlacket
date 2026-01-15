(async () => {
  /* ================= CONFIG ================= */
  const SALES_TARGET = 50;
  const MAX_RETRIES = 5;
  const REQUEST_DELAY = 300;
  const RETRY_DELAY = 800;
  /* ========================================== */

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const username = prompt("Enter username to calculate inventory value:");
  if (!username) return console.log("No username entered.");

  console.log("Fetching user inventory…");

  const userRes = await fetch(`/worker2/user/${encodeURIComponent(username)}`);
  const userData = await userRes.json();

  if (userData.error) {
    console.error("Failed to fetch user:", userData.reason);
    return;
  }

  const inventory = userData.user.blooks;
  console.log(`Loaded inventory for ${userData.user.username}`);

  /* ===== Load blook metadata ===== */
  const metaRes = await fetch("/data/index.json");
  const meta = await metaRes.json();
  const blookMeta = meta.blooks;

  /* ===== Fixed rarity pricing ===== */
  const RARITY_PRICES = {
    Uncommon: 5,
    Rare: 20,
    Epic: 75,
    Legendary: 200
  };

  async function getAveragePriceWithRetry(blookName) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const now = new Date();
        const cutoff = new Date();
        cutoff.setMonth(now.getMonth() - 3);

        let page = 1;
        let prices = [];

        while (prices.length < SALES_TARGET) {
          const url =
            `/worker/staff/audit/${page}` +
            `?action=${encodeURIComponent(JSON.stringify(["bazaar","bought"]))}` +
            `&user=undefined` +
            `&search=${encodeURIComponent(`"${blookName}"`)}`;

          const res = await fetch(url);
          if (!res.ok) break;

          const data = await res.json();
          if (!data.audit || !data.audit.length) break;

          for (const entry of data.audit) {
            if (prices.length >= SALES_TARGET) break;

            const match = entry.reason.match(/for\s+(\d+)\s+tokens/i);
            if (!match) continue;

            const date = new Date(entry.date);
            if (date < cutoff) continue;

            prices.push(Number(match[1]));
          }

          if (page >= data.pages) break;
          page++;
          await sleep(REQUEST_DELAY);
        }

        if (!prices.length) throw "No sales found";

        prices.sort((a, b) => a - b);

        // Outlier removal (IQR)
        const q1 = prices[Math.floor(prices.length * 0.25)];
        const q3 = prices[Math.floor(prices.length * 0.75)];
        const iqr = q3 - q1;
        const low = q1 - 1.5 * iqr;
        const high = q3 + 1.5 * iqr;

        const clean = prices.filter(p => p >= low && p <= high);
        return Math.round(clean.reduce((a, b) => a + b, 0) / clean.length);

      } catch (e) {
        console.warn(`Retry ${attempt}/${MAX_RETRIES} for ${blookName}`);
        await sleep(RETRY_DELAY);
      }
    }
    return null;
  }

  let totalValue = 0;
  let results = [];
  let failed = [];

  for (const [blook, amount] of Object.entries(inventory)) {
    if (!amount) continue;

    const info = blookMeta[blook];
    if (!info) {
      failed.push(blook);
      continue;
    }

    let unitPrice;
    if (RARITY_PRICES[info.rarity]) {
      unitPrice = RARITY_PRICES[info.rarity];
    } else {
      unitPrice = await getAveragePriceWithRetry(blook);
      if (unitPrice === null) {
        failed.push(blook);
        continue;
      }
    }

    const value = unitPrice * amount;
    totalValue += value;

    results.push({
      blook,
      rarity: info.rarity,
      amount,
      unitPrice,
      totalValue: value
    });
  }

  console.table(results);
  console.log(
    `TOTAL INVENTORY VALUE for ${userData.user.username}:`,
    totalValue.toLocaleString(),
    "tokens"
  );

  if (failed.length) {
    console.warn("Failed to price these blooks:", failed);
  }
})();
