/* REQUIRES PANEL ACCESS */

(async () => {
    const INPUT = prompt("Enter the blook name to analyze:");
    if (!INPUT) return console.log("No blook entered.");

    const blookName = `"${INPUT}"`;
    const TARGET_MATCHES = 100;
    const DELAY_MS = 120;

    const now = Date.now();
    const threeMonthsAgo = now - (1000 * 60 * 60 * 24 * 30 * 3);

    let page = 1;
    let collected = [];

    console.log("Collector started for:", blookName);

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    while (collected.length < TARGET_MATCHES) {
        const url =
            `/worker/staff/audit/${page}` +
            `?action=${encodeURIComponent(JSON.stringify(["bazaar","bought"]))}` +
            `&user=undefined&search=${encodeURIComponent(blookName)}`;

        const res = await fetch(url);
        if (!res.ok) {
            console.error("Failed page", page);
            break;
        }

        const data = await res.json();
        const entries = data.audit || [];
        if (!entries.length) break;

        let stopByDate = false;

        for (const entry of entries) {
            const entryTime = new Date(entry.date).getTime();

            if (entryTime < threeMonthsAgo) {
                stopByDate = true;
                break;
            }

            const reason = entry.reason;
            if (!reason.includes(blookName)) continue;

            const match = reason.match(
                /bought\s+"(.+?)"\s+from\s+(.+?)\s+\((\d+)\)\s+for\s+(\d+)\s+tokens/i
            );
            if (!match) continue;

            collected.push({
                blook: match[1],
                buyer: entry.user.username,
                seller: match[2],
                sellerId: match[3],
                price: Number(match[4]),
                date: new Date(entry.date)
            });

            if (collected.length >= TARGET_MATCHES) break;
        }

        if (stopByDate || page >= data.pages) break;

        page++;
        await sleep(DELAY_MS); // anti-spam delay
    }

    if (!collected.length) {
        console.log(`No sales found for ${blookName} in the last 3 months.`);
        return;
    }

    // ---- ANALYSIS ----
    const prices = collected.map(s => s.price).sort((a,b)=>a-b);

    const avg =
        prices.reduce((a,b)=>a+b,0) / prices.length;

    const q1 = prices[Math.floor(prices.length * 0.25)];
    const q3 = prices[Math.floor(prices.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    const outliers = collected.filter(s => s.price < lower || s.price > upper);
    const clean = collected.filter(s => s.price >= lower && s.price <= upper);
    const cleanAvg =
        clean.reduce((a,b)=>a+b.price,0) / clean.length;

    console.log(`Collected ${collected.length} sales`);
    console.log("Average price (all):", avg.toFixed(2));
    console.log("Average price (no outliers):", cleanAvg.toFixed(2));

    if (outliers.length) {
        console.log("Outliers:");
        console.table(outliers);
    } else {
        console.log("No outliers found.");
    }

    console.table(collected);
})();
