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
function getProp(props, ...names) {
  const norm = s => s.toLowerCase().replace(/\s+/g,"");
  const targets = names.map(norm);
  for (const key of Object.keys(props)) {
    if (targets.includes(norm(key))) return props[key];
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
  if (!prop?.files) return [];
  return prop.files.map(f => f.type === "file" ? f.file.url : f.type === "external" ? f.external.url : null).filter(Boolean);
}
async function findSteamUrl(title) {
  try {
    const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`);
    if (!r.ok) return null;
    const d = await r.json();
    const items = d?.items || [];
    const q = title.toLowerCase();
    const m = items.find(i => i.name.toLowerCase() === q) || items.find(i => i.name.toLowerCase().startsWith(q));
    return m ? `https://store.steampowered.com/app/${m.id}/` : null;
  } catch { return null; }
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).send("NOTION_TOKEN not set");

  const slug = req.query?.slug;
  if (!slug) return res.status(400).send("Missing slug");

  try {
    // ── Find game in Notion ───────────────────────────────────
    let found = null, hasMore = true, cursor;
    while (hasMore && !found) {
      const body = { filter: { property: "Status", select: { equals: "Complete" } }, page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const nr = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!nr.ok) return res.status(nr.status).send("Notion error");
      const data = await nr.json();
      found   = data.results.find(p => toSlug(p.properties.title?.title?.[0]?.plain_text || "") === slug);
      hasMore = data.has_more && !found;
      cursor  = data.next_cursor;
    }
    if (!found) return res.status(404).send("Game not found");

    // ── Extract properties ────────────────────────────────────
    const p         = found.properties;
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
    const gameplayText = getRichText(p, "gameplay", "Gameplay");
    const graphicsText = getRichText(p, "graphics and art direction", "Graphics and Art Direction");
    const storyText    = getRichText(p, "story and worldbuilding", "Story and Worldbuilding", "story and world building", "Story and World Building");
    const soundText    = getRichText(p, "sound and music", "Sound and Music", "sounds and music", "Sounds and Music");
    const screenshots  = getFiles(p, "personal screenshots", "Personal Screenshots");
    const coverUrl     = found.cover?.external?.url || found.cover?.file?.url || null;
    const manualProp   = getProp(p, "store url", "Store URL", "store link", "Store Link", "steam", "Steam");
    const storeUrl     = manualProp?.url || await findSteamUrl(title);

    // ── OG metadata ───────────────────────────────────────────
    const host      = req.headers.host || "theboneszone2.vercel.app";
    const baseUrl   = `https://${host}`;
    const pageUrl   = `${baseUrl}/games/${slug}`;
    const imageUrl  = `${baseUrl}/api/cover-image?slug=${encodeURIComponent(slug)}`;
    const scoreStr  = rating !== null ? `${rating}/5 — ${verdictLabel(rating)}` : "Unscored";
    const notesSnip = notes ? notes.slice(0, 130).trimEnd() + (notes.length > 130 ? "…" : "") : "";
    const ogDesc    = notesSnip ? `${scoreStr}. ${notesSnip}` : `${scoreStr}. A game review by Lord Scotty on The Bones Zone.`;

    // Safe JSON injection (escape </script> inside strings)
    const gameData = { title, rating, dev, genres, consoles, released, completed, notes, mechanics, story, art, music, sfx, coverUrl, slug, gameplayText, graphicsText, storyText, soundText, screenshots, storeUrl };
    const safeJson = JSON.stringify(gameData).replace(/<\/script>/gi, "<\\/script>");

    // ── HTML ──────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — The Bones Zone</title>

  <!-- Open Graph -->
  <meta property="og:type"        content="article">
  <meta property="og:site_name"   content="The Bones Zone">
  <meta property="og:title"       content="${esc(title)} — The Bones Zone">
  <meta property="og:description" content="${esc(ogDesc)}">
  <meta property="og:url"         content="${esc(pageUrl)}">
  ${coverUrl ? `<meta property="og:image"       content="${esc(imageUrl)}">` : ""}

  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(title)} — The Bones Zone">
  <meta name="twitter:description" content="${esc(ogDesc)}">
  ${coverUrl ? `<meta name="twitter:image"       content="${esc(imageUrl)}">` : ""}

  <link rel="canonical" href="${esc(pageUrl)}">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .loading-state{display:flex;align-items:center;gap:.75rem;padding:4rem 0;font-family:var(--mono);font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--text-dim)}
    .loading-dot{width:6px;height:6px;background:var(--amber);border-radius:50%;animation:blink .8s infinite alternate}
    .loading-dot:nth-child(2){animation-delay:.2s}
    .loading-dot:nth-child(3){animation-delay:.4s}
    @keyframes blink{to{opacity:.15}}
    .error-msg{padding:4rem 0;font-family:var(--mono);font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--danger)}
    .error-msg::before{content:'// Error: ';color:var(--amber-dim)}
    #review-content{display:none}
  </style>
</head>
<body>

<nav class="site-nav">
  <div class="nav-inner">
    <a href="/" class="nav-logo">The <span>Bones</span> Zone</a>
    <ul class="nav-links">
      <li><a href="/">Home</a></li>
      <li><a href="/games.html" class="active">Games</a></li>
      <li><a href="/films.html">Films</a></li>
      <li><a href="/books.html">Books</a></li>
    </ul>
  </div>
</nav>

<main>
  <div class="container" style="padding-top:2rem">

    <p class="mono dim" id="breadcrumb" style="font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;margin-bottom:2rem">
      <a href="/games.html" style="color:var(--text-dim)">Games</a>
      <span style="color:var(--amber);margin:0 .5rem">/</span>
      <span id="breadcrumb-title">Loading…</span>
    </p>

    <div class="loading-state" id="loading">
      <span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>
      <span>Fetching from Notion</span>
    </div>
    <div class="error-msg" id="error" style="display:none"></div>

    <div id="review-content">
      <div class="review-layout">
        <article class="review-main animate-in">
          <div class="review-cover" id="cover-wrap">
            <img id="cover-img" src="" alt="" style="display:none">
            <div id="cover-placeholder" class="card-thumb-placeholder" style="height:100%;display:flex;align-items:center;justify-content:center">[ no image ]</div>
          </div>
          <div class="card-meta" style="margin-bottom:.5rem">
            <span class="type-pill game">Game</span>
            <span id="genre-str"></span>
          </div>
          <h1 class="review-headline" id="headline"></h1>
          <p class="review-byline">
            Reviewed by <span>Lord Scotty</span> &nbsp;//&nbsp;
            <span id="byline-dev"></span> &nbsp;//&nbsp;
            <span id="byline-platform"></span> &nbsp;//&nbsp;
            Completed <span id="byline-completed"></span>
          </p>
          <hr class="rule" style="margin-bottom:2rem">
          <div class="review-body" id="review-body">
            <div id="review-notes-wrap" style="margin-bottom:1.5rem"><p id="review-notes"></p></div>
            <div id="review-sections"></div>
          </div>
          <div class="screenshots-section">
            <button class="screenshots-toggle" onclick="toggleScreenshots(this)" aria-expanded="false">
              <span class="mono" style="font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--text-dim)">// Personal Screenshots</span>
              <span class="screenshots-chevron">▸</span>
            </button>
            <div class="screenshots-body" hidden>
              <div class="screenshots-grid">
                <p class="screenshots-empty mono">// No screenshots added yet</p>
              </div>
            </div>
          </div>
        </article>

        <aside class="review-sidebar animate-in delay-2">
          <div class="sidebar-block">
            <div class="sidebar-label">Overall score</div>
            <div class="score-display">
              <span class="score-number" id="score-num">—</span>
              <span class="score-denom">/ 5</span>
            </div>
            <div class="score-dots" id="score-dots"></div>
          </div>
          <hr class="rule">
          <div class="sidebar-block">
            <div class="sidebar-label">Breakdown</div>
            <div id="breakdown"></div>
          </div>
          <hr class="rule">
          <div class="sidebar-block">
            <div class="sidebar-label">Verdict</div>
            <p class="verdict-text" id="verdict"></p>
          </div>
          <hr class="rule">
          <div class="sidebar-block">
            <div class="sidebar-label">File info</div>
            <table class="info-table" id="info-table"></table>
          </div>
        </aside>
      </div>
    </div>
  </div>
</main>

<footer class="site-footer">
  <div class="container footer-inner">
    <span class="logo">The Bones Zone</span>
    <span>// All opinions filed and irreversible</span>
  </div>
</footer>

<script src="/js/main.js"></script>
<script src="/js/cover-manifest.js"></script>
<script>
// Game data pre-injected server-side — no second API call needed
window.GAME_DATA = ${safeJson};

function fmtDate(iso){if(!iso)return"Unknown";return new Date(iso).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
function fmtDateShort(iso){if(!iso)return"Unknown";return new Date(iso).toLocaleDateString("en-US",{month:"short",year:"numeric"})}
function verdict(r){if(r===null)return"Unscored";if(r>=5)return"Masterpiece";if(r>=4.5)return"Essential";if(r>=4)return"Excellent";if(r>=3.5)return"Good";if(r>=3)return"Decent";if(r>=2)return"Mixed";if(r>=1)return"Poor";return"Avoid"}
function scoreDots(r){if(r===null)return"";const filled=Math.floor(r);const half=(r%1)>=0.5;let html="";for(let i=0;i<5;i++){if(i<filled)html+=\`<div class="score-dot filled"></div>\`;else if(i===filled&&half)html+=\`<div class="score-dot" style="background:linear-gradient(90deg,var(--amber) 50%,transparent 50%);border-color:var(--amber)"></div>\`;else html+=\`<div class="score-dot"></div>\`}return html}
function statRow(label,val){if(val===null)return"";const pct=Math.round((val/5)*100);return\`<div class="stat-row"><span class="stat-name">\${label}</span><div class="stat-bar"><div class="stat-fill" data-pct="\${pct}"></div></div><span class="stat-val">\${val}</span></div>\`}
function infoRow(label,val){if(!val)return"";return\`<tr><td>\${label}</td><td>\${val}</td></tr>\`}
function makePreview(text,max=160){if(!text||text.length<=max)return text;return text.slice(0,max).trimEnd()+"…"}
function buildReviewSections(sections){
  const container=document.getElementById("review-sections");
  if(!container)return;
  const filled=sections.filter(s=>s.text&&s.text.trim());
  if(!filled.length)return;
  filled.forEach(({label,text})=>{
    const paras=text.split(/\\n\\n+/).filter(p=>p.trim());
    const preview=makePreview(paras[0]);
    const bodyHtml=paras.map(p=>\`<p>\${p}</p>\`).join("");
    const section=document.createElement("div");
    section.className="review-section";
    section.innerHTML=\`
      <button class="review-section-toggle" aria-expanded="false">
        <span class="review-section-label">\${label}</span>
        <span class="review-section-line"></span>
        <span class="review-section-chevron">▸</span>
      </button>
      <div class="review-section-preview">\${preview}</div>
      <div class="review-section-body">\${bodyHtml}</div>
    \`;
    section.querySelector(".review-section-toggle").addEventListener("click",()=>{
      const open=section.classList.toggle("open");
      section.querySelector(".review-section-toggle").setAttribute("aria-expanded",open);
    });
    container.appendChild(section);
  });
}

function renderGame(game) {
  document.title = game.title + " — The Bones Zone";
  document.getElementById("breadcrumb-title").textContent = game.title;

  const localSrc = (typeof COVER_IMAGES !== "undefined" && COVER_IMAGES[game.slug]) || null;
  if (localSrc || game.coverUrl) {
    const img = document.getElementById("cover-img");
    img.src = localSrc || game.coverUrl;
    img.alt = game.title;
    img.style.display = "";
    document.getElementById("cover-placeholder").style.display = "none";
  }
  if (game.storeUrl) {
    const wrap = document.getElementById("cover-wrap");
    wrap.style.cursor = "pointer";
    wrap.title = game.storeUrl.includes("epicgames") ? "View on Epic Games Store" : game.storeUrl.includes("steampowered") ? "View on Steam" : "View in Store";
    wrap.addEventListener("click", () => window.open(game.storeUrl, "_blank", "noopener"));
  }
  document.getElementById("genre-str").textContent = game.genres.slice(0,3).join(" · ");
  document.getElementById("headline").textContent  = game.title;
  document.getElementById("byline-dev").textContent = game.dev;
  document.getElementById("byline-platform").textContent = game.consoles.slice(0,2).join(" / ") || "PC";
  document.getElementById("byline-completed").textContent = fmtDate(game.completed);
  if (game.notes && game.notes.trim()) {
    document.getElementById("review-notes").textContent = game.notes;
  } else {
    document.getElementById("review-notes-wrap").style.display = "none";
  }
  document.getElementById("score-num").textContent = game.rating !== null ? game.rating : "—";
  document.getElementById("score-dots").innerHTML  = scoreDots(game.rating);
  document.getElementById("breakdown").innerHTML   =
    statRow("Gameplay", game.mechanics) + statRow("Graphics", game.art) +
    statRow("Story", game.story) + statRow("Sound", game.sfx || game.music);
  document.getElementById("verdict").textContent = verdict(game.rating);
  document.getElementById("info-table").innerHTML =
    infoRow("Developer", game.dev) + infoRow("Released", fmtDateShort(game.released)) +
    infoRow("Completed", fmtDateShort(game.completed)) +
    infoRow("Platform", game.consoles.join(", ") || "PC") +
    infoRow("Genre", game.genres.slice(0,3).join(", "));
  buildReviewSections([
    { label: "Gameplay",                   text: game.gameplayText },
    { label: "Graphics and Art Direction", text: game.graphicsText },
    { label: "Story and World Building",   text: game.storyText },
    { label: "Sound and Music",            text: game.soundText },
  ]);
  if (game.screenshots && game.screenshots.length > 0) {
    document.querySelector(".screenshots-grid").innerHTML = game.screenshots.map((url,i) =>
      \`<figure class="screenshot-item"><img src="\${url}" alt="Screenshot \${i+1}" loading="lazy"></figure>\`
    ).join("");
  }
  document.getElementById("loading").style.display = "none";
  document.getElementById("review-content").style.display = "block";
  initStatBars();
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.GAME_DATA) {
    renderGame(window.GAME_DATA);
  } else {
    document.getElementById("loading").style.display = "none";
    document.getElementById("error").style.display = "";
    document.getElementById("error").textContent = "Failed to load game data";
  }
});
</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(html);

  } catch (err) {
    return res.status(500).send("Error: " + err.message);
  }
};
