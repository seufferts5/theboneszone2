const DATABASE_ID = "3a7ccf9e-b5b8-40de-ab98-c01372ca894a";

function toSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}


function getProp(props, ...names) {
  const normalize = s => s.toLowerCase().replace(/\s+/g, "");
  const targets = names.map(normalize);
  for (const key of Object.keys(props)) {
    if (targets.includes(normalize(key))) return props[key];
  }
  return null;
}

function getRichText(props, ...names) {
  const prop = getProp(props, ...names);
  if (!prop) return "";
  return (prop.rich_text || []).map(t => t.plain_text).join("");
}

function getFiles(props, ...names) {
  const prop = getProp(props, ...names);
  if (!prop || !prop.files) return [];
  return prop.files.map(f => {
    if (f.type === "file") return f.file.url;
    if (f.type === "external") return f.external.url;
    return null;
  }).filter(Boolean);
}

async function findSteamUrl(title) {
  try {
    const searchRes = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`
    );
    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const items = data?.items || [];
    if (!items.length) return null;
    const q = title.toLowerCase();
    const match = items.find(i => i.name.toLowerCase() === q)
                || items.find(i => i.name.toLowerCase().startsWith(q));
    if (!match) return null;
    return `https://store.steampowered.com/app/${match.id}/`;
  } catch {
    return null;
  }
}

async function findEpicUrl(title) {
  try {
    const query = `{
      Catalog {
        searchStore(keywords: ${JSON.stringify(title)}, category: "games/edition/base|bundles/games|editors", count: 5) {
          elements {
            title
            urlSlug
            catalogNs {
              mappings(pageType: "productHome") {
                pageSlug
              }
            }
          }
        }
      }
    }`;
    const epicRes = await fetch("https://graphql.epicgames.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    if (!epicRes.ok) return null;
    const data = await epicRes.json();
    const elements = data?.data?.Catalog?.searchStore?.elements || [];
    if (!elements.length) return null;
    const q = title.toLowerCase();
    const match = elements.find(e => e.title.toLowerCase() === q)
                || elements.find(e => e.title.toLowerCase().startsWith(q));
    if (!match) return null;
    const slug = match.catalogNs?.mappings?.[0]?.pageSlug || match.urlSlug;
    if (!slug) return null;
    return `https://store.epicgames.com/en-US/p/${slug}`;
  } catch {
    return null;
  }
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

    const gameplayText  = getRichText(p, "gameplay", "Gameplay");
    const graphicsText  = getRichText(p, "graphics and art direction", "Graphics and Art Direction");
    const storyText     = getRichText(p, "story and worldbuilding", "Story and Worldbuilding", "story and world building", "Story and World Building");
    const soundText     = getRichText(p, "sound and music", "Sound and Music", "sounds and music", "Sounds and Music");
    const screenshots   = getFiles(p, "personal screenshots", "Personal Screenshots");

    const coverUrl = found.cover?.external?.url || found.cover?.file?.url || null;
    const storeUrl = await findSteamUrl(title) || await findEpicUrl(title);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({
      title, rating, dev, genres, consoles, released, completed,
      notes, mechanics, story, art, music, sfx, coverUrl, slug: toSlug(title),
      gameplayText, graphicsText, storyText, soundText, screenshots, storeUrl
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
