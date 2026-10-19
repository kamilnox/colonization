# New World

A small turn based strategy game in the spirit of Sid Meier's Colonization (1994), built to be
played and developed entirely from a phone.

It is a plain HTML + JavaScript web app with no build step. Add it to your iPhone home screen and
it runs fullscreen like a native app, works offline and keeps your saved game.

**Play:** https://kamilnox.github.io/colonization/ (after the one time setup below)

## What is in the game

- Random map every game: a continent with forests, hills, native villages and lost city rumours
- Ships that carry colonists and goods, and sail to Europe from the high seas (dark blue water)
- Colonies: put colonists on fields or in buildings, grow food, build docks, stockades, forts...
- Europe: sell your goods, buy tools, muskets and horses, recruit colonists, train experts, buy ships
- Experts produce double, and natives can teach free colonists a skill
- Pioneers clear forests, plow fields and build roads. Scouts talk to chiefs and explore ruins
- Liberty bells, rebel sentiment, declaring independence and fighting the King's army
- Autosave to the phone, so you can close the app at any time

## One time setup (from the phone)

1. **Hosting needs a public repo.** GitHub Pages is free for public repositories. For a private repo
   it needs a paid plan (GitHub Pro). To make it public: github.com, open this repo, Settings,
   scroll to *Danger Zone*, *Change visibility*, *Public*.
2. **Turn on Pages.** Settings, *Pages*, under *Build and deployment* pick *Deploy from a branch*,
   then branch `gh-pages` and folder `/ (root)`, and Save. (The `gh-pages` branch is created by the
   deploy action on the first push.)
3. Wait a minute, then open https://kamilnox.github.io/colonization/ in **Safari**.
4. Tap the Share button, then **Add to Home Screen**. Start the game from the new icon.

## How the phone-only workflow works

1. Ask Claude Code (in the Claude app) for a change, for example "add a minimap".
2. Claude edits the code and pushes to a `claude/...` branch.
3. The **Deploy to GitHub Pages** action runs the rules test and publishes the game. This takes about a minute.
   You can watch it in the GitHub app under Actions.
4. Open the game from your home screen. A yellow bar says a new version is ready: tap it.
   The current build number is shown in ☰ menu, *Reload app*.

Every push to `main` or any `claude/**` branch is deployed, so the latest push always wins.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | The page and its styles |
| `js/data.js` | All game numbers: terrain, goods, prices, units, buildings. Start here to rebalance |
| `js/mapgen.js` | Random map generator |
| `js/game.js` | New game, end of turn, independence, victory and defeat |
| `js/colony.js` | Colony production, jobs, building |
| `js/movement.js`, `js/path.js` | Moving units, route finding, rumours, native villages, pioneer work |
| `js/combat.js`, `js/ai.js` | Battles and the King's army |
| `js/europe.js` | Market, recruiting, ships crossing the Atlantic |
| `js/ui/` | Map renderer, touch input, bottom panel, colony and Europe screens, menus |
| `sw.js`, `manifest.webmanifest`, `icons/` | What makes it an installable, offline capable app |
| `tools/smoke.js` | Headless test: a bot plays a few games to catch rule bugs |

## Running it on a computer

```sh
python3 -m http.server 8080   # then open http://localhost:8080
node tools/smoke.js           # rules smoke test
```
