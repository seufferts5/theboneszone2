const DATABASE_ID = "3a7ccf9e-b5b8-40de-ab98-c01372ca894a";

function toSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

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
  } catch { return null; }
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "NOTION_TOKEN not set" });
  }

  const slug = req.query?.slug;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug parameter" });
  }

  try {
    let found = null;
    let hasMore = true;
    let cursor = undefined;

    while (hasMore && !found) {
      const reqBody = {
        filter: { property: "Status", select: { equals: "Complete" } },
        page_size: 100
      };
      if (cursor) reqBody.start_cursor = cursor;

      const notionRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(reqBody)
      });

      const text = await notionRes.text();
      if (!notionRes.ok) {
        return res.status(notionRes.status).json({ error: text });
      }

      const data = JSON.parse(text);
      found = data.results.find(p => {
        const title = p.properties.title?.title?.[0]?.plain_text || "";
        return toSlug(title) === slug;
      });
      hasMore = data.has_more && !found;
      cursor = data.next_cursor;
    }

    if (!found) {
      return res.status(404).json({ error: "Game not found" });
    }

    const p = found.properties;
    const title     = p.title?.title?.[0]?.plain_text || "Untitled";
    const rating    = p.Rating?.number ?? null;
    const dev       = p.Developer?.rich_text?.[0]?.plain_text || "";
    const genres    = p.genre?.multi_select?.map(g => g.name) || [];
    const consoles  = p.Console?.multi_select?.map(c => c.name) || [];
    const released  = p["Release Date"]?.date?.start || null;
    const completed = p["Date Completed"]?.date?.start || null;
    const notes     = p["Review Notes"]?.rich_text?.[0]?.plain_text || "";
    const mechanics = p.Mechanics?.number ?? null;
    const story     = p.Story?.number ?? null;
    const art       = p.Art?.number ?? null;
    const music     = p.Music?.number ?? null;
    const sfx       = p.SFX?.number ?? null;

    let coverUrl = found.cover?.external?.url || found.cover?.file?.url || null;
    if (!coverUrl) coverUrl = await getSteamImage(title);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({
      title, rating, dev, genres, consoles, released, completed,
      notes, mechanics, story, art, music, sfx, coverUrl, slug: toSlug(title)
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
