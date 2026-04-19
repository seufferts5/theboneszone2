const DATABASE_ID = "3a7ccf9e-b5b8-40de-ab98-c01372ca894a";

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: "NOTION_TOKEN is not set" });

  try {
    const notionRes = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization:    "Bearer " + token,
          "Notion-Version": "2022-06-28",
          "Content-Type":   "application/json",
        },
        body: JSON.stringify({
          filter: { property: "Status", select: { equals: "Currently Playing" } },
          sorts:  [{ property: "title", direction: "ascending" }],
          page_size: 20,
        }),
      }
    );

    if (!notionRes.ok) {
      const text = await notionRes.text();
      return res.status(notionRes.status).json({ error: `Notion API ${notionRes.status}`, detail: text });
    }

    const data = await notionRes.json();

    const games = (data.results || []).map(page => {
      const p        = page.properties;
      const title    = p.title?.title?.[0]?.plain_text || "Untitled";
      const dev      = p.Developer?.rich_text?.[0]?.plain_text || "";
      const consoles = p.Console?.multi_select?.map(c => c.name) || [];
      const genres   = p.genre?.multi_select?.map(g => g.name) || [];
      const slug     = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const coverUrl = page.cover?.external?.url || page.cover?.file?.url || null;
      return { title, dev, consoles, genres, slug, coverUrl };
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ games });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
