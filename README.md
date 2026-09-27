# Writer-GPT — landing page replica

A static, no-build replica of the writer-gpt.com marketing page: dark-first design,
animated stat ticker, typewriter hero, bulk-writer feature grid, pricing with a
monthly/yearly toggle, FAQ and a cookie bar.

> **Note:** this is a design replica built for reference. It is not affiliated with
> writer-gpt.com, and the copy, pricing and statistics are illustrative placeholders,
> not the real site's content.

## Run it

No build step, no dependencies — just serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly works too.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All page markup plus an inline SVG icon sprite |
| `styles.css` | Design tokens, layout, light/dark themes, responsive rules |
| `script.js` | Theme toggle, nav, typewriter, counters, reveals, pricing toggle, cookie bar |
| `assets/favicon.svg` | Browser tab icon |

## Design tokens

Colours, radii and fonts are CSS custom properties on `:root` in `styles.css`, with a
light-theme override under `:root[data-theme="light"]`. To rebrand, change the token
values — the accent is driven by `--accent`, `--accent-2` and `--glow`.

Dark is the default. The header toggle writes the choice to `localStorage`
(`wg-theme`), so a returning visitor keeps their preference.

## Behaviour notes

- **Typewriter** — the cycling words live in the `words` array in `script.js`.
- **Counters** — any element with `class="count" data-count="12345"` counts up when it
  scrolls into view, and renders the final value immediately under
  `prefers-reduced-motion`.
- **Scroll reveals** — driven by `IntersectionObserver`, with a timeout failsafe so
  content is never left invisible if the observer never fires (headless capture,
  printing).
- **Pricing toggle** — each price carries `data-month` and `data-year`; the toggle
  swaps the value and the billing suffix.
- **Signup form** — validates client-side and prints a confirmation. It is a demo:
  nothing is submitted anywhere.
- **Cookie bar** — the choice is stored in `localStorage` (`wg-cookie`). "Manage" is a
  placeholder; a real deployment needs an actual preference centre.
- All `localStorage` access is wrapped in `try/catch` so the page works in private mode.

## Verified

Rendered in Chromium at 320 / 390 / 480 / 640 / 768 / 820 / 1024 / 1440 px with no
horizontal overflow, and the nav, mega menu, pricing toggle, form, theme persistence,
counters and cookie bar exercised end to end.

## Not wired up

There is no backend. Log in, signup, language switching, "Manage" cookies and the
footer links are all inert placeholders.
