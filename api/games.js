const DATABASE_ID = "3a7ccf9e-b5b8-40de-ab98-c01372ca894a";
const PAGE_SIZE = 18;


module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "NOTION_TOKEN is not set" });
  }

  const cursor = req.query?.cursor || undefined;
  const sort   = req.query?.sort || "rating-desc";
  const limit  = req.query?.limit ? parseInt(req.query.limit) : null;

  const sortMap = {
    "rating-desc":  [{ property: "Rating",       direction: "descending" }],
    "rating-asc":   [{ property: "Rating",       direction: "ascending"  }],
    "release-desc": [{ property: "Release Date", direction: "descending" }],
    "release-asc":  [{ property: "Release Date", direction: "ascending"  }],
    "alpha":        [{ property: "title",        direction: "ascending"  }],
  };

  try {
    const reqBody = {
      filter: { property: "Status", select: { equals: "Complete" } },
      sorts: sortMap[sort] || sortMap["rating-desc"],
      page_size: limit || PAGE_SIZE
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

    const games = await Promise.all((data.results || []).map(async page => {
      const p = page.properties;
      const title     = p.title?.title?.[0]?.plain_text || "Untitled";
      const rating    = p.Rating?.number ?? null;
      const dev       = p.Developer?.rich_text?.[0]?.plain_text || "";
      const genres    = p.genre?.multi_select?.map(g => g.name) || [];
      const consoles  = p.Console?.multi_select?.map(c => c.name) || [];
      const released  = p["Release Date"]?.date?.start || null;
      const completed = p["Date Completed"]?.date?.start || null;
      const slug      = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      const coverUrl = page.cover?.external?.url || page.cover?.file?.url || null;

      return { title, rating, dev, genres, consoles, released, completed, slug, coverUrl };
    }));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      games,
      next_cursor: data.has_more ? data.next_cursor : null,
      has_more: data.has_more || false,
      synced: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
