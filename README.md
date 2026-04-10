# The Bones Zone

A personal review site for games, films, and books.
Designed with Prey (2017) UI inspiration — dark, amber-accented, terminal aesthetic.

---

## File Structure

```
theboneszone/
├── index.html          ← Homepage
├── games.html          ← Games listing
├── films.html          ← Films listing
├── books.html          ← Books listing
├── css/
│   └── style.css       ← All styles
├── js/
│   └── main.js         ← Filtering, animations
└── pages/
    ├── games/
    │   └── prey-2017.html      ← Example game review
    ├── films/
    │   └── example-film.html   ← Film review template
    └── books/
        └── example-book.html   ← Book review template
```

---

## How to Add a New Review

### 1. Duplicate the template
- Game review: copy `pages/games/prey-2017.html`
- Film review: copy `pages/films/example-film.html`
- Book review: copy `pages/books/example-book.html`

### 2. Update the content
Edit the new file and replace:
- Page `<title>` tag
- `review-headline` (title)
- `review-byline` (author/developer, year, platform)
- `review-body` paragraphs (your actual review text)
- Score number in `.score-number`
- Score dots (add/remove `filled` class)
- Breakdown stat values and `data-pct` percentages (0–100)
- Verdict text
- Info table rows
- Cover image (replace the placeholder div with: `<img src="..." alt="...">`)

### 3. Add the card to the listing page
Open `games.html` (or films/books) and duplicate an existing `.card` block.
Update the `href`, score badge, title, excerpt, and date.

Also add the card to `index.html` if it should appear on the homepage.

---

## Scoring Guide

All scores are 0–5 in 0.5 increments.

For the score dots (5 dots total):
- Full dot:  `<div class="score-dot filled"></div>`
- Half dot:  `<div class="score-dot" style="background: linear-gradient(90deg, var(--amber) 50%, transparent 50%); border-color:var(--amber);"></div>`
- Empty dot: `<div class="score-dot"></div>`

Stat bar percentages: multiply score by 20 for percentage.
Example: 3.5 out of 5 = 70%

---

## Hosting on Netlify (Free)

1. Zip the entire `theboneszone/` folder
2. Go to netlify.com → sign up free
3. Drag and drop the zip onto the Netlify dashboard
4. You'll get a live URL like `random-name.netlify.app`
5. Optional: rename the site or add a custom domain in site settings

---

## Changing Colours

All colours are CSS variables at the top of `css/style.css`:

```css
--amber: #d4890a;      /* game accent */
--film:  #6ab0d4;      /* film accent */
--book:  #7abf7a;      /* book accent */
--bg:    #0a0a0c;      /* background */
--text:  #ccc8bc;      /* body text */
```

Change any of these and it cascades everywhere.
