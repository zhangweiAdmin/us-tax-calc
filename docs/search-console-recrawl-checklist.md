# Search Console Recrawl Checklist

Use this checklist after a content or metadata release to prompt Google to re-crawl the five priority pages first.

## Priority pages

1. `https://zlxjy.com/`
2. `https://zlxjy.com/safe-harbor-calculator/`
3. `https://zlxjy.com/home-office-deduction-calculator/`
4. `https://zlxjy.com/mortgage-refinance-calculator/`
5. `https://zlxjy.com/crypto-staking-calculator/`

## Recommended order

1. Home page
2. Safe Harbor calculator
3. Home Office deduction calculator
4. Mortgage Refinance calculator
5. Crypto Staking calculator

## What to do in Google Search Console

1. Open the `https://zlxjy.com/` property.
2. Submit `https://zlxjy.com/sitemap.xml` in the Sitemaps report if it has not already been submitted.
3. Open URL Inspection for each priority page.
4. Run the live URL test first.
5. If the live test is successful, click Request indexing.
6. Move to the next URL after the request is accepted.
7. Avoid repeated submissions of the same URL in a short period. Google notes that multiple requests for the same URL do not make it crawl faster.

## Validation points to check before requesting indexing

- Canonical URL uses HTTPS and the trailing slash version.
- The page returns HTTP 200.
- `robots.txt` allows crawling.
- `sitemap.xml` includes the page URL.
- The page title, description, and visible heading reflect the target keyword theme.

## Follow-up

- Recheck the URL Inspection status after 24 to 72 hours.
- If a page still looks stale in Search Console, re-validate the live URL rather than spamming request indexing.
- Keep the sitemap updated whenever a new important page goes live.

## References

- [Ask Google to recrawl your URLs](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
