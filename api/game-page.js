const fs          = require("fs");
const path        = require("path");
const DATABASE_ID = "3a7ccf9e-b5b8-40de-ab98-c01372ca894a";

function toSlug(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function verdictLabel(r) {
  if (r === null) return "Unscored";
  if (r >= 5)   return "Masterpiece";
  if (r >= 4.5) return "Essential";
  if (r >= 4)   return "Excellent";
  if (r >= 3.5) return "Good";
  if (r >= 3)   return "Decent";
  if (r >= 2)   return "Mixed";
  if (r >= 1)   return "Poor";
  return "Avoid";
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).send("NOTION_TOKEN not set");

  const slug = req.query?.slug;
  if (!slug) return res.status(400).send("Missing slug");

  try {
    // ── Fetch just enough data from Notion for OG tags ───────
    let found = null, hasMore = true, cursor;
    while (hasMore && !found) {
      const body = {
        filter: { property: "Status", select: { equals: "Complete" } },
        page_size: 100,
      };
      if (cursor) body.start_cursor = cursor;

      const nr = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method:  "POST",
        headers: {
          Authorization:    "Bearer " + token,
          "Notion-Version": "2022-06-28",
          "Content-Type":   "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!nr.ok) return res.status(nr.status).send("Notion error");

      const data = await nr.json();
      found   = data.results.find(p => toSlug(p.properties.title?.title?.[0]?.plain_text || "") === slug);
      hasMore = data.has_more && !found;
      cursor  = data.next_cursor;
    }
    if (!found) return res.status(404).send("Game not found");

    // ── Extract OG fields only ────────────────────────────────
    const p       = found.properties;
    const title   = p.title?.title?.[0]?.plain_text || "Untitled";
    const rating  = p.Rating?.number ?? null;
    const notes   = p["Review Notes"]?.rich_text?.[0]?.plain_text || "";
    const hasCover = !!(found.cover?.external?.url || found.cover?.file?.url);

    const host      = req.headers.host || "theboneszone2.vercel.app";
    const baseUrl   = `https://${host}`;
    const pageUrl   = `${baseUrl}/games/${slug}`;
    const imageUrl  = `${baseUrl}/api/cover-image?slug=${encodeURIComponent(slug)}`;
    const scoreStr  = rating !== null ? `${rating}/5 — ${verdictLabel(rating)}` : "Unscored";
    const notesSnip = notes ? notes.slice(0, 130).trimEnd() + (notes.length > 130 ? "…" : "") : "";
    const ogDesc    = notesSnip
      ? `${scoreStr}. ${notesSnip}`
      : `${scoreStr}. A game review by Lord Scotty on The Bones Zone.`;

    // ── Build OG tag block to inject ─────────────────────────
    const ogTags = `
  <!-- Open Graph -->
  <meta property="og:type"        content="article">
  <meta property="og:site_name"   content="The Bones Zone">
  <meta property="og:title"       content="${esc(title)} — The Bones Zone">
  <meta property="og:description" content="${esc(ogDesc)}">
  <meta property="og:url"         content="${esc(pageUrl)}">
  ${hasCover ? `<meta property="og:image" content="${esc(imageUrl)}">` : ""}
  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(title)} — The Bones Zone">
  <meta name="twitter:description" content="${esc(ogDesc)}">
  ${hasCover ? `<meta name="twitter:image" content="${esc(imageUrl)}">` : ""}
  <link rel="canonical" href="${esc(pageUrl)}">`;

    // ── Load the existing review page and patch it ────────────
    const reviewPath = path.join(__dirname, "..", "pages", "games", "review.html");
    let html = fs.readFileSync(reviewPath, "utf8");

    // Inject OG tags after <head>
    html = html.replace("<head>", `<head>${ogTags}`);

    // Set the page title server-side
    html = html.replace(
      "<title>Loading… — The Bones Zone</title>",
      `<title>${esc(title)} — The Bones Zone</title>`
    );

    // Fix relative asset paths to absolute (review.html uses ../../)
    html = html.replace(/href="\.\.\/\.\.\//g, 'href="/');
    html = html.replace(/src="\.\.\/\.\.\//g,  'src="/');

    // Fix relative nav links
    html = html.replace(/href="\.\.\/\.\.\/index\.html"/g, 'href="/"');
    html = html.replace(/href="\.\.\/\.\.\/games\.html"/g, 'href="/games.html"');
    html = html.replace(/href="\.\.\/\.\.\/films\.html"/g, 'href="/films.html"');
    html = html.replace(/href="\.\.\/\.\.\/books\.html"/g, 'href="/books.html"');

    // Fix breadcrumb link
    html = html.replace(/href="\.\.\/\.\.\/games\.html" style="color:var\(--text-dim\)"/g,
      'href="/games.html" style="color:var(--text-dim)"');

    // Inject the slug so loadGame() can read it from the URL path
    html = html.replace(
      "document.addEventListener(\"DOMContentLoaded\", loadGame);",
      `// Slug injected server-side for path-based URLs\nwindow.GAME_SLUG = ${JSON.stringify(slug)};\ndocument.addEventListener("DOMContentLoaded", loadGame);`
    );

    // Patch loadGame to use window.GAME_SLUG if no ?slug= param
    html = html.replace(
      "const slug   = params.get(\"slug\");",
      "const slug   = params.get(\"slug\") || window.GAME_SLUG;"
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(html);

  } catch (err) {
    return res.status(500).send("Error: " + err.message);
  }
};
