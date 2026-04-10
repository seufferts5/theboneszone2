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

    const title     = get("title");
    const link      = get("link");
    const pubDate   = get("pubDate");
    const desc      = get("description");

    // Extract star rating from title e.g. "The Shining, ★★★★½"
    const ratingMatch = title.match(/[★½]+$/);
    let rating = null;
    if (ratingMatch) {
      const stars = ratingMatch[0];
      const full  = (stars.match(/★/g) || []).length;
      const half  = stars.includes("½") ? 0.5 : 0;
      rating = full + half;
    }

    // Clean film title (remove year and rating suffix)
    const cleanTitle = title.replace(/,?\s*\d{4}.*$/, "").trim();

    // Extract year from title
    const yearMatch = title.match(/,\s*(\d{4})/);
    const year = yearMatch ? yearMatch[1] : null;

    // Extract review text from description HTML
    const reviewMatch = desc.match(/<p>([\s\S]*?)<\/p>/g);
    let review = "";
    if (reviewMatch) {
      // Skip the first <p> which is usually the poster image
      const textParas = reviewMatch
        .map(p => p.replace(/<[^>]+>/g, "").trim())
        .filter(p => p.length > 0 && !p.startsWith("Watched"));
      review = textParas.join("\n\n");
    }

    if (cleanTitle) {
      items.push({ title: cleanTitle, year, rating, review, link, pubDate });
    }
  }
  return items;
}

async function getTMDBPoster(title, year, tmdbKey) {
  try {
    const q = encodeURIComponent(title);
    const yearParam = year ? `&year=${year}` : "";
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${q}${yearParam}&language=en-US&page=1`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    if (!result?.poster_path) return null;
    return `https://image.tmdb.org/t/p/w500${result.poster_path}`;
  } catch { return null; }
}

module.exports = async (req, res) => {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    return res.status(500).json({ error: "TMDB_API_KEY not set" });
  }

  try {
    const rssRes = await fetch(`https://letterboxd.com/${LETTERBOXD_USER}/rss/`, {
      signal: AbortSignal.timeout(8000)
    });
    if (!rssRes.ok) throw new Error(`Letterboxd RSS ${rssRes.status}`);
    const xml = await rssRes.text();

    const items = parseRSS(xml);

    // Fetch TMDB posters in parallel
    const films = await Promise.all(items.map(async (item) => {
      const posterUrl = await getTMDBPoster(item.title, item.year, tmdbKey);
      const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return {
        title:     item.title,
        year:      item.year,
        rating:    item.rating,
        review:    item.review,
        link:      item.link,
        pubDate:   item.pubDate,
        posterUrl,
        slug
      };
    }));

    const sort = req.query?.sort || "date-desc";
    const sorted = [...films].sort((a, b) => {
      switch (sort) {
        case "rating-desc": return (b.rating ?? -1) - (a.rating ?? -1);
        case "rating-asc":  return (a.rating ?? 99) - (b.rating ?? 99);
        case "date-asc":    return new Date(a.pubDate||0) - new Date(b.pubDate||0);
        case "alpha":       return a.title.localeCompare(b.title);
        case "date-desc":
        default:            return new Date(b.pubDate||0) - new Date(a.pubDate||0);
      }
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res.status(200).json({ films: sorted, total: sorted.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
