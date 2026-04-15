const DATABASE_ID = "3a7ccf9e-b5b8-40de-ab98-c01372ca894a";

function toSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).end();

  const slug = req.query?.slug;
  if (!slug) return res.status(400).end();

  try {
    // Find the game in Notion to get its current (fresh) cover URL
    let coverUrl = null;
    let hasMore  = true;
    let cursor   = undefined;

    while (hasMore && !coverUrl) {
      const body = {
        filter:    { property: "Status", select: { equals: "Complete" } },
        page_size: 100,
      };
      if (cursor) body.start_cursor = cursor;

      const notionRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method:  "POST",
        headers: {
          Authorization:    "Bearer " + token,
          "Notion-Version": "2022-06-28",
          "Content-Type":   "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!notionRes.ok) return res.status(502).end();
      const data = await notionRes.json();

      const match = data.results.find(p => {
        const title = p.properties.title?.title?.[0]?.plain_text || "";
        return toSlug(title) === slug;
      });

      if (match) {
        coverUrl = match.cover?.external?.url || match.cover?.file?.url || null;
      }

      hasMore = data.has_more && !match;
      cursor  = data.next_cursor;
    }

    if (!coverUrl) return res.status(404).end();

    // Fetch the image and stream it back with long-lived edge cache
    const imgRes = await fetch(coverUrl);
    if (!imgRes.ok) return res.status(502).end();

    const buf = await imgRes.arrayBuffer();
    const ct  = imgRes.headers.get("content-type") || "image/jpeg";

    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.end(Buffer.from(buf));

  } catch (err) {
    res.status(500).end();
  }
};
