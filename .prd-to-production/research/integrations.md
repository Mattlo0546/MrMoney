# Integration research — MCP vs API vs scrape vs curated (2026-10-31)

Research role, phase 1 (brief v1 not yet approved). Five research subagents (Sonnet, web search, with a few page fetches). Most of the evidence comes from search snippets. Items marked (U) are unverified. This research does not change the brief: live integrations remain an MVP non-goal (brief v1, R-offers). The "Proposed brief changes" section at the end needs user approval.

## Decision key

- **MCP**: an official or maintained MCP server that the agent calls at runtime.
- **API**: an official API or affiliate feed, called from our server route.
- **Grounding**: a Gemini built-in tool, such as Google Maps or Search grounding.
- **User-shared**: the user pastes a link, screenshot or caption, and Gemini extracts structured data from it. There is no crawling.
- **Curated**: a hand-built static JSON. Each entry carries its `source` URL, a `checked` date, and a "sample / indicative" label.
- **Scrape**: automated collection from the source website. We recommend against this everywhere (see Cross-cutting findings).
- **Skip**: not worth pursuing.

## Decision matrix

| Source | Official access | MCP available | Scraping | **Hackathon** | **Production** |
|---|---|---|---|---|---|
| **Google Maps / Places** (restaurants, price tiers) | Places API (New) has `priceLevel` and `priceRange`; the free tier is per-SKU | **Official**: Grounding Lite MCP (`mapstools.googleapis.com/mcp`). The reference `modelcontextprotocol` server is archived. | Google sued SerpApi (Dec 2025) | **Grounding / MCP**: Gemini *Grounding with Google Maps* (5k free per month, then $14 per 1k) for discovery | Grounding plus Places API. Store only `place_id`. |
| **Cheap restaurants in London** (editorial) | None (Time Out, Hot Dinners, Eater have no API or RSS) (U) | None | Would copy editorial content | **Curated**: 30–50 places with typical £ meal price and attribution | Curated plus user-submitted prices |
| **Restaurant prices from Google** | `priceRange` (£ min–max) on Places, Enterprise SKU (U on UK coverage) | Grounding Lite (price field not documented) | No (ToS, SerpApi lawsuit) | **API** for a few demo places; label it as an estimate | API; prices cannot be cached; build our own price data from user-recorded actuals |
| **NeoTaste** | No API. Awin affiliate programme (links only). | None | Deals are only in the app, behind a subscription | **Curated** | Partnership, or Awin deep links |
| **Restaurant / student discounts** (UNiDAYS, Student Beans, TOTUM, tastecard, chains) | No deal APIs. **Awin Offers API** is the one real feed (publisher approval takes days). | None found (one unverified Awin entry on mcp.so) | Behind logins | **Curated**: chain student discounts with source and checked date | Affiliate feeds (Awin) plus direct partnerships |
| **Too Good To Go** | None (only unofficial clients for its private app API) | None | Breaks ToS; availability changes by the minute | **Skip** | Skip unless partnered |
| **Tesco Clubcard Prices** | No grocery or Clubcard API (Tesco Labs portal status (U)) | Community only (basketeer; jbeshir supermarkets-uk, 1 star, driven by a browser) | Apify actors exist; Clubcard Prices visible without login, per scraper vendors (U) | **Curated** basket of about 30 staples | Licence (e.g. Trolley) or skip |
| **Waitrose**: the scheme is **My Waitrose** ("Little Waitrose" is a shop format) | None | jbeshir MCP only (driven by a browser) | No Apify actor | **Curated** (perks: Little Treats, free hot drink) | Curated |
| **Sainsbury's Nectar / Lidl Plus / Aldi / Co-op** | None | None (Apify actors can run as an MCP) | Sainsbury's uses Akamai Bot Manager; Lidl has Apify actors | **Curated** | Curated or licence |
| **Trolley.co.uk** (grocery price comparison) | No public API | Its Apify actor can run as an MCP (Standby mode) | robots.txt is permissive; updates daily | **Curated** snapshot (live via Apify is optional) | **Licence** from Trolley (best route to live grocery prices) |
| **Open Food Facts / Open Prices** | **Free official API** (ODbL licence, attribution required) | (U) | Not needed | **API**, optional, for product details | API (UK price coverage (U)) |
| **Monzo** | Developer API is for the developer's own account only; 90-day re-authentication (SCA) | Community only (hobby grade) | Not allowed: an unregulated account-information service | **Skip** (mock ledger) | Through an Open Banking aggregator |
| **Wise** | UK/EU personal tokens cannot read balance statements (PSD2). The rates API is for affiliates only. Has a sandbox. | Community, read-only (AIWerk, v0.1.7) | Not allowed | **Skip** | Partnership, or through an aggregator |
| **Open Banking aggregators** | TrueLayer and Yapily have self-serve sandboxes; Plaid UK has a sandbox. **GoCardless BAD closed to new signups (July 2025).** | None found | — | Skip, or a TrueLayer sandbox as a stretch goal | **API**: TrueLayer, which is the FCA-authorised account-information provider |
| **Savings / bank rates** | Moneyfacts API (sales-led); DepositScout (early access, has an MCP page (U)) | DepositScout (U) | Moneyfacts terms unclear | **Curated** 6–10 accounts with an "as of" date | Licensed feed |
| **Xiaohongshu (XHS / RedNote)** | No API for searching content (the open platform is for merchants and ads) (U) | Community `xpzouying/xiaohongshu-mcp` (~16.7k stars): headless browser with a logged-in cookie | High risk: account bans, XHS ToS, China's data-protection law (PIPL) | **User-shared** screenshots and captions, plus curated seeds | User-shared. **Do not crawl.** |
| **Instagram Reels** | Basic Display API shut down (Dec 2024). Hashtag search: business accounts only, 30 tags per 7 days. | Community (U) | Bright Data ruling covers logged-out scraping in the US only | **User-shared** (Gemini can't fetch IG URLs; it needs a screenshot or downloaded file) | User-shared |
| **YouTube** (compliant video alternative) | Data API v3 | — | Not needed | **Gemini reads YouTube URLs natively** | Same |
| **TikTok** | Research API is for academics only | — | High | Skip | Skip |

## Answer to "MCP or scrape?"

**Integrate via MCP or tools (official only):**
1. **Google Maps**, through Gemini *Grounding with Google Maps* or the official **Grounding Lite MCP**. It's first-party, cheap at demo volume, and fits a Gemini hackathon.

**Official API (not MCP), from the server route:**
2. **Google Places API (New)** for `priceRange` and `priceLevel`. Store only `place_id`.
3. **Gemini over YouTube URLs**, which is the only compliant way to read food videos.
4. Roadmap: Awin Offers API, a TrueLayer aggregator, and Open Food Facts.

**Scrape: none.** Every source on your list that would need scraping is ruled out:
- NeoTaste, UNiDAYS and TGTG are behind logins or only in an app.
- XHS and Instagram risk account bans and breach their terms.
- Sainsbury's uses Akamai bot protection.
- Google sued SerpApi.
- Scraping logged-in banking is unregulated account access.
- Community MCPs for Tesco, Waitrose, XHS and Monzo are scraping in disguise (browser automation with a logged-in session or private endpoints), so they belong with scraping, not MCP.

**Instead of scraping, use two patterns:**
- **Curated datasets** for niche, slow-changing knowledge: Clubcard/My Waitrose/Nectar perks, chain student discounts, NeoTaste-style deals, a cheap-eats list and a grocery staples basket. Each entry has `source`, `checked`, `conditions` and a "sample" label. This matches R-offers exactly.
- **User-shared extraction** for XHS, Instagram and TikTok: the user pastes a screenshot, caption or link, Gemini returns `{place, dish, price, area}`, and we check the place against Google Maps grounding.

## Cross-cutting findings

- **Google Maps content can't be cached.** Only `place_id` may be stored, so a persistent price database must come from our own data, such as actual spending the user records.
- **Gemini cannot fetch Instagram or XHS URLs.** It only takes YouTube URLs or uploaded files.
- **Community MCPs carry their source's risk.** Most UK retail and social MCPs drive a browser with the user's cookies, so they inherit the scraping risk.
- **The demo needs no credentials (R-demo).** Every hackathon recommendation above either falls back to curated data or works on free tiers. Maps grounding needs `GEMINI_API_KEY`, so the app must degrade to curated data without it.

## User decisions (2026-10-31, second message)

- **Accepted: live Maps with a fallback.** Grounding with Google Maps when a key is present; the curated cheap-eats list otherwise.
- **Accepted: screenshot extraction.** The user shares XHS or Instagram screenshots or captions, and Gemini extracts place, dish and price.
- **New: Gemini 4 Argon is the app's main agent.** The user has an AI Studio key with no daily request cap. The quota page shows Argon 4 at 10K RPM and 20M TPM; Maps grounding at 25K requests/day; and **Search grounding for Gemini 3 and newer at 1.5K requests/day**, which is the binding limit.
- **Requested: Google search via computer use / browser agents.** Substituted with Search grounding plus URL context (official tools, same result). Driving google.com with Computer Use breaches Google's ToS on automated queries. Browsing app-only sources (NeoTaste, Tesco member prices) with a bot is the same mining their ToS forbid.
- **Requested: expand the integrations list.** See `expansion.md`; it is still being written.
- **Constraint found (`gemini-argon.md`):** the Search grounding terms forbid caching, analysing or indexing results, so **results cannot be used to build a dataset**. Maps grounding content may be cached for up to 90 days, with no export. Consequences:
  - Argon uses Search and Maps grounding **live, per user request**. Search Suggestions and Maps attribution must be displayed.
  - Curated datasets come from first-party pages: read by research agents, or by Argon's URL context tool on known brand and editorial URLs. They never come from stored Search grounding output.

## Proposed brief changes (need user approval; not applied)

1. **R-offers seed data**: build the sample catalogue from the curated datasets above (chain student discounts, supermarket loyalty perks, cheap eats with typical £ prices). Each entry carries `source`, `checked` and `conditions`.
2. **Optional stretch, R-places**: when `GEMINI_API_KEY` is set, "cheap food near me" uses Grounding with Google Maps. Show Maps attribution and don't cache results. Without the key, fall back to curated data. This touches the current non-goal "live retailer or discount integrations" (Maps is not a retailer, but it is live data), so it needs an explicit decision.
3. **Roadmap additions**:
   - user-shared XHS / Instagram screenshot extraction
   - YouTube food-video extraction
   - Awin Offers feed
   - TrueLayer aggregator, replacing direct Monzo / Wise integration
   - a Trolley licence for grocery prices
4. **Correct the terminology**: the Waitrose loyalty scheme is My Waitrose, not "Little Waitrose".

## Open questions to verify by test

- Does `priceRange` return £ values for London places, and how often is it filled in? Test on 20 places.
- Do Maps-grounded Gemini answers include price information?
- Which current Gemini model IDs support Maps grounding? This links to brief open decision 1.
- Awin publisher approval time, and whether Pizza Express, Wagamama or Nando's are Awin advertisers.

## Restaurant-discount follow-up

### NeoTaste (pages fetched directly)

- **robots.txt** allows crawling in general but blocks partner, voucher and `code=` paths.
- **Public pages**: the `/restaurants/london` page shows "1,028 restaurants" but no deal details; deals exist only in the app.
- **ToS §11.3** prohibits text and data mining of app content (citing §44b of the German Copyright Act). §11.2 restricts use to personal use.
- **Verdict**: **do not scrape**. Use a link-out, the Awin affiliate programme, or a partnership.

### Chain student-discount seed list (verify each on the brand's own page before demo day)

| Chain | Offer (as reported) | Verified via | Confidence |
|---|---|---|---|
| Pizza Express | 30% off food and drink, Sun–Thu | UNiDAYS / Student Beans | Low (older sources say 25% Sun–Fri) |
| Zizzi | 30% off food, Sun–Thu | UNiDAYS | Medium |
| Itsu | 15% off | Student Beans / Itsu app | Medium |
| Leon | 15% off (other sources say 25% with £8 minimum) | Student Beans | Low |
| Nando's | No standing offer (trial paused) | — | Medium |
| Wagamama | No standing offer (only a seasonal results-day Soul Club promo) | — | Medium |
| Bella Italia, Pret, Five Guys, Chipotle | None found | — | Low (brand pages not checked) |

Source: unifresher.co.uk (updated 28 Aug 2026), cross-checked against university guides at Bath and LSE.

### Affiliate feeds and platforms

- **tastecard**: on **Awin** (merchant 16164 (U)).
- **Zizzi**: an Awin campaign was mentioned (U).
- **Pizza Express**: rejoined tastecard / Gourmet Society in Dec 2024 with 25% off. This means a tastecard feed may cover several of these chains.
- **OpenTable / TheFork**: partner-gated booking APIs. OpenTable approval takes about 3–4 weeks. Neither exposes deals. TheFork MCP / Apify options are scrapers.
- **MCP servers**: generic affiliate MCPs exist (Glama `affiliatemcp` for Awin, `mcp-dealfinder`; Smithery `vouchernaut/deals`). None are restaurant-specific. All are community-built and unvetted.

**Conclusion**: the curated seed list is the hackathon choice. **Awin Offers API plus the tastecard programme** is the only realistic live route for production.

## Round 2: curated datasets (2026-10-31)

All datasets are in `research/data/`. Every entry carries `source_url`, `checked` and `confidence`, and every price is labelled indicative.

| File | Contents | Quality |
|---|---|---|
| `chain-student-discounts.json` | 36 chains | 3 high confidence; 10 have conflicting sources (both values recorded); Bella Italia and Yo! Sushi offers expire 31 Oct / 1 Nov |
| `cheap-eats-london.json` | 63 places, 16 free-food options | 4 high confidence; many prices from 2018–22 sources; thin coverage of Bloomsbury, Mile End and South Kensington |
| `supermarket-loyalty.json` | 10 schemes | Only Co-op is high confidence; no student-specific perks; Iceland bonus is about 5% (not 25%) |
| `grocery-basket.json` | 29 items plus Which? Sept 2026 basket benchmarks (12 rows) | Aldi prices good (26 of 29 items); Lidl prices are app-only; Clubcard and Nectar prices blocked (403); **Which? benchmark: Aldi £159.48 is cheapest and Waitrose £223.38 dearest** |
| `transport-london.json` | TfL, railcards, bikes, coaches | Student Oyster terms come from TfL itself; most fares are secondary sources; a bus fare change on 1 Nov is unverified. Default spend: about £6.40/day for zones 1–2 |
| `student-money.json` | Bank accounts, savings, transfers, bills | Low confidence (roadmap only); council tax facts are high confidence |

Other outputs: `expansion.md` (29 apps ranked into tiers) and `gemini-argon.md` (Argon 4 capabilities and grounding terms).

**Pending:** the Argon 4 vs Claude comparison (`scratchpad/argon_bakeoff.py`). It needs the user's API key in `scratchpad/gemini.env`. The Claude baseline is `chain-student-discounts.json` (36 entries, about 2.5 minutes of tool time, 29 of 36 entries sourced from secondary pages).
