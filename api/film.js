const LETTERBOXD_USER = "scottys1998";

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? (m[1] || m[2] || "").trim() : "";
    };

    const title    = get("title");
    const link     = get("link");
    const pubDate  = get("pubDate");
    const desc     = get("description");

    const ratingMatch = title.match(/[★½]+$/);
    let rating = null;
    if (ratingMatch) {
      const stars = ratingMatch[0];
      const full  = (stars.match(/★/g) || []).length;
      const half  = stars.includes("½") ? 0.5 : 0;
      rating = full + half;
    }

    const cleanTitle = title.replace(/,?\s*\d{4}.*$/, "").trim();
    const yearMatch  = title.match(/,\s*(\d{4})/);
    const year       = yearMatch ? yearMatch[1] : null;

    const reviewMatch = desc.match(/<p>([\s\S]*?)<\/p>/g);
    let review = "";
    if (reviewMatch) {
      const textParas = reviewMatch
        .map(p => p.replace(/<[^>]+>/g, "").trim())
        .filter(p => p.length > 0 && !p.startsWith("Watched"));
      review = textParas.join("\n\n");
    }

    const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (cleanTitle) items.push({ title: cleanTitle, year, rating, review, link, pubDate, slug });
  }
  return items;
}

async function getTMDBData(title, year, tmdbKey) {
  try {
    const q = encodeURIComponent(title);
    const yearParam = year ? `&year=${year}` : "";
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${q}${yearParam}&language=en-US&page=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return {};
    return {
      posterUrl:   result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
      backdropUrl: result.backdrop_path ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}` : null,
      overview:    result.overview || "",
      genres:      [], // would need a detail call
    };
  } catch { return {}; }
}

module.exports = async (req, res) => {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.status(500).json({ error: "TMDB_API_KEY not set" });

  const slug = req.query?.slug;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    const rssRes = await fetch(`https://letterboxd.com/${LETTERBOXD_USER}/rss/`, {
      signal: AbortSignal.timeout(8000)
    });
    if (!rssRes.ok) throw new Error(`Letterboxd RSS ${rssRes.status}`);
    const xml = await rssRes.text();

    const items = parseRSS(xml);
    const film  = items.find(f => f.slug === slug);
    if (!film) return res.status(404).json({ error: "Film not found" });

    const tmdb = await getTMDBData(film.title, film.year, tmdbKey);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=600");
    return res.status(200).json({ ...film, ...tmdb });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
