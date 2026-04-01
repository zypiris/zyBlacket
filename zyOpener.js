const DELAY = 450;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const openPack = pack =>
  new Promise((resolve, reject) => {
    blacket.requests.post("/worker3/open", { pack }, data => {
      if (data?.error) reject(data.error);
      else resolve(data.blook);
    });
  });
const main = async (pack, amount) => {
  const results = [];
  for (let i = 0; i < amount; i++) {
    try {
      const blook = await openPack(pack);
      results.push(blook);
      console.log(`[${i + 1}/${amount}] ${blook}`);
    } catch (err) {
      console.warn("Rate limited / error — backing off");
      await sleep(DELAY);
      i--;
      continue;
    }
    await sleep(DELAY);
  }
  console.log("%c\nPACK SUMMARY", "font-size:3em;font-weight:bold");
  const counts = {};
  for (const b of results) counts[b] = (counts[b] || 0) + 1;
  const rarityOrder = Object.entries(blacket.rarities)
    .sort((a, b) => a[1].exp - b[1].exp)
    .map(x => x[0]);
  Object.keys(counts)
    .sort((a, b) =>
      rarityOrder.indexOf(blacket.blooks[b].rarity) -
      rarityOrder.indexOf(blacket.blooks[a].rarity)
    )
    .forEach(blook => {
      const rarity = blacket.blooks[blook].rarity;
      const color = blacket.rarities[rarity].color;
      console.log(`%c${blook} x${counts[blook]}`, `color:${color};font-size:1.5em`);
    });
};
(async () => {
  const packs = Object.keys(blacket.packs);
  let pack;
  do {
    pack = prompt("Enter a pack (case-sensitive)");
    if (pack === null) return;
  } while (!packs.includes(pack));
  const maxPacks = Math.floor(blacket.user.tokens / blacket.packs[pack].price);
  let amount;
  do {
    amount = parseInt(prompt(`Enter packs to open (Max: ${maxPacks})`));
    if (amount === null) return;
  } while (!amount || amount < 1 || amount > maxPacks);
  await main(pack, amount);
})();
