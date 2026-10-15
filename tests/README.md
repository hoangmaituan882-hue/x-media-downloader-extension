# Regression checks

Run `npm test` for storage hydration, Chrome JSON media transport, terminal download
states, concurrent sequence reservation, actual destination grouping and API
template ownership. These tests import the real TypeScript modules through Vite
and execute the real background/injected scripts with isolated browser boundaries.

Run `npm run build` then `npm run test:extension` for native Edge extension checks:
multi-chunk binary equality, real filesystem writes, a download taking over nine
seconds and a cancelled download. The runner copies `dist/` to a temporary extension
and uses a separate browser profile, localhost server and temporary download files.
It never accesses an X account. Results go to `test-results/extension.json`.

## Media view transitions

Run `npm run test:media-views` after installing dependencies. The runner starts a
temporary Vite server on port 5180 and uses installed Microsoft Edge headlessly.
It samples real animation frames from the production panel inside a Shadow Root.

Checks cover all twelve directed List/Card/Tweet/Pack transitions, three media
identities including the two rear pack covers, pack drill-down/return, scrolling,
dark theme, rapid switching, selection preservation, reduced motion and the
shared-element hover preview. Results and a screenshot go to `test-results/`.

To check that the regression detects an earlier implementation without replacing
workspace source, set `XMD_MEDIA_VIEWS_BASELINE` to a saved copy of `Grid.tsx`.
The test server substitutes that file in memory only.

## Inline downloads and downloaded markers

Run `npm run test:inline-media` for the delegated page button and panel integration.
The runner uses a local fixture, intercepted image responses and a generated playable
video. Checks cover the circle-to-label morph, player overlays and posters, state
feedback, automatic exclusion after a later scan, all four panel views, settings
changes and reduced motion. No X account or real download is used. Results and the
button screenshot go to `test-results/inline-media*`.

## Hover preview stability

Run `npm run test:hover-preview` to sample real animation frames while the pointer
stays still over List/Card/Tweet/History thumbnails. It also checks moving into the
large image, leaving both image regions, quick passes, explicit dismissal without
reopening and cancelling pending previews on view changes. Results and a screenshot
go to `test-results/hover-preview*`. Timers and pointer events use the real browser.
