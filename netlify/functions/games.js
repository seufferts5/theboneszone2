const DATABASE_ID = "3a7ccf9e-b5b8-40de-ab98-c01372ca894a";

// Fetch Steam header image URL by searching game name
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

exports.handler = async function() {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "NOTION_TOKEN is not set" })
    };
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

      const res = await fetch(
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

      const text = await res.text();
      if (!res.ok) {
        return {
          statusCode: res.status,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: `Notion API ${res.status}`, detail: text })
        };
      }

      const data = JSON.parse(text);
      allResults = allResults.concat(data.results || []);
      hasMore = data.has_more || false;
      cursor = data.next_cursor || undefined;
    }

    // Process games and fetch Steam images in parallel
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

      // Cover image: use Notion page cover if set, else fall back to Steam CDN
      let coverUrl = page.cover?.external?.url || page.cover?.file?.url || null;
      if (!coverUrl) {
        coverUrl = await getSteamImage(title);
      }

      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      return { title, rating, status, dev, genres, consoles, released, completed, notes, slug, coverUrl };
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600"
      },
      body: JSON.stringify({ games, synced: new Date().toISOString(), total: games.length })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
