const DATABASE_ID = "3a7ccf9e-b5b8-40de-ab98-c01372ca894a";

async function getSteamImage(title) {
  try {
    const q = encodeURIComponent(title);
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${q}&l=en&cc=us`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const appid = data?.items?.[0]?.id;
    if (!appid) return null;
    return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    return res.status(500).json({ error: "NOTION_TOKEN is not set" });
  }

  try {
    let allResults = [];
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
      const reqBody = {
        filter: { property: "Status", select: { equals: "Complete" } },
        sorts: [{ property: "Rating", direction: "descending" }],
        page_size: 100
      };
      if (cursor) reqBody.start_cursor = cursor;

      const notionRes = await fetch(
        `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(reqBody)
        }
      );

      const text = await notionRes.text();
      if (!notionRes.ok) {
        return res.status(notionRes.status).json({ error: `Notion API ${notionRes.status}`, detail: text });
      }

      const data = JSON.parse(text);
      allResults = allResults.concat(data.results || []);
      hasMore = data.has_more || false;
      cursor = data.next_cursor || undefined;
    }

    const games = await Promise.all(allResults.map(async page => {
      const p = page.properties;

      const title     = p.title?.title?.[0]?.plain_text || "Untitled";
      const rating    = p.Rating?.number ?? null;
      const status    = p.Status?.select?.name || "";
      const dev       = p.Developer?.rich_text?.[0]?.plain_text || "";
      const genres    = p.genre?.multi_select?.map(g => g.name) || [];
      const consoles  = p.Console?.multi_select?.map(c => c.name) || [];
      const released  = p["Release Date"]?.date?.start || null;
      const completed = p["Date Completed"]?.date?.start || null;
      const notes     = p["Review Notes"]?.rich_text?.[0]?.plain_text || "";

      let coverUrl = page.cover?.external?.url || page.cover?.file?.url || null;
      if (!coverUrl) coverUrl = await getSteamImage(title);

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      return { title, rating, status, dev, genres, consoles, released, completed, notes, slug, coverUrl };
    }));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ games, synced: new Date().toISOString(), total: games.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
