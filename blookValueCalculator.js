/* NOTE THAT THIS SCRIPT REQUIRES PANEL ACCESS TO WORK PROPERLY */

(async () => {
    let blookName = prompt("Enter the blook name to analyze:");
    if (!blookName) return console.log("No blook entered.");

    // Automatically add quotes for exact matching
    blookName = `"${blookName}"`;

    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(now.getMonth() - 3); // 3-month cutoff

    let page = 1;
    let collected = [];
    const CAP = 250;

    console.log("Collector started for blook:", blookName);

    while (collected.length < CAP) {
        const url = `/worker/staff/audit/${page}?action=${encodeURIComponent(JSON.stringify(["bazaar","bought"]))}&user=undefined&search=${encodeURIComponent(blookName)}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.error("Failed to fetch page", page);
            break;
        }

        const data = await res.json();
        const entries = data.audit || [];

        if (entries.length === 0) break;

        for (const entry of entries) {
            if (collected.length >= CAP) break;

            const reason = entry.reason;
            const regex = /bought\s+"(.+?)"\s+from\s+(.+?)\s+\((\d+)\)\s+for\s+(\d+)\s+tokens/i;
            const match = reason.match(regex);
            if (match && `"${match[1]}"` === blookName) {  // exact match using quotes
                const date = new Date(entry.date);
                if (date >= threeMonthsAgo) {
                    collected.push({
                        blook: match[1],
                        buyer: entry.user.username,
                        seller: match[2],
                        sellerId: match[3],
                        price: Number(match[4]),
                        date
                    });
                }
            }
        }

        if (page >= data.pages) break;
        page++;
    }

    if (collected.length === 0) {
        console.log(`No sales found for blook ${blookName} in the last 3 months.`);
        return;
    }

    // Sort prices
    const prices = collected.map(s => s.price).sort((a,b)=>a-b);

    // Average including all sales
    const totalPrice = prices.reduce((sum, p) => sum + p, 0);
    const avgPrice = totalPrice / prices.length;

    // Outlier detection (IQR)
    const q1 = prices[Math.floor(prices.length * 0.25)];
    const q3 = prices[Math.floor(prices.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5*iqr;
    const upper = q3 + 1.5*iqr;
    const outliers = collected.filter(s => s.price < lower || s.price > upper);
    const nonOutliers = collected.filter(s => s.price >= lower && s.price <= upper);

    // Average excluding outliers
    const cleanTotal = nonOutliers.reduce((sum, s) => sum + s.price, 0);
    const cleanAvg = nonOutliers.length > 0 ? cleanTotal / nonOutliers.length : 0;

    console.log(`Collected ${collected.length} sales of ${blookName} in the last 3 months (capped at ${CAP}).`);
    console.log("Average price (all sales):", avgPrice.toFixed(2));
    console.log("Average price (excluding outliers):", cleanAvg.toFixed(2));
    console.log("Total tokens:", totalPrice);

    if (outliers.length > 0) {
        console.log(`Found ${outliers.length} outlier(s):`);
        console.table(outliers);
    } else {
        console.log("No outliers found.");
    }

    console.table(collected);
})();
