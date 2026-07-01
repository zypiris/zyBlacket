const DELAY = 360;
const PROGRESS_INTERVAL = 100;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Disable unnecessary ping requests
const originalGet = blacket.requests.get;
blacket.requests.get = (url, callback) => {
    if (url === "/worker/ping") return;
    return originalGet(url, callback);
};

const openPack = pack =>
    new Promise((resolve, reject) => {
        blacket.requests.post("/worker3/open", { pack }, data => {
            if (data?.error) reject(data.error);
            else resolve(data.blook);
        });
    });

const main = async (pack, amount) => {
    const counts = new Map();

    // Cache blook info
    const blookInfo = {};
    for (const [name, info] of Object.entries(blacket.blooks)) {
        blookInfo[name] = {
            rarity: info.rarity,
            color: blacket.rarities[info.rarity].color
        };
    }

    // Cache rarity order
    const rarityOrder = Object.fromEntries(
        Object.entries(blacket.rarities)
            .sort((a, b) => a[1].exp - b[1].exp)
            .map(([rarity], index) => [rarity, index])
    );

    for (let i = 0; i < amount; i++) {
        try {
            const blook = await openPack(pack);

            counts.set(blook, (counts.get(blook) ?? 0) + 1);

            if ((i + 1) % PROGRESS_INTERVAL === 0 || i + 1 === amount) {
                console.log(`Opened ${i + 1}/${amount} packs...`);
            }

        } catch (err) {
            console.warn("Rate limited / error — backing off");
            await sleep(DELAY);
            i--;
            continue;
        }

        await sleep(DELAY);
    }

    console.log("%c\nPACK SUMMARY", "font-size:3em;font-weight:bold");

    [...counts.entries()]
        .sort((a, b) => {
            const rarityA = blookInfo[a[0]].rarity;
            const rarityB = blookInfo[b[0]].rarity;

            return (
                rarityOrder[rarityB] - rarityOrder[rarityA] ||
                a[0].localeCompare(b[0])
            );
        })
        .forEach(([blook, count]) => {
            const info = blookInfo[blook];

            console.log(
                `%c${blook} x${count}`,
                `color:${info.color};font-size:1.5em`
            );
        });
};

(async () => {
    const packs = Object.keys(blacket.packs);

    let pack;
    do {
        pack = prompt("Enter a pack (case-sensitive)");
        if (pack === null) return;
    } while (!packs.includes(pack));

    const maxPacks = Math.floor(
        blacket.user.tokens / blacket.packs[pack].price
    );

    let amount;
    do {
        const input = prompt(`Enter packs to open (Max: ${maxPacks})`);
        if (input === null) return;
        amount = Number(input);
    } while (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > maxPacks
    );

    await main(pack, amount);
})();
