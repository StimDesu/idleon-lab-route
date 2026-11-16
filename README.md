# IdleOn Lab Route Planner

Browser tool for planning the World 4 Laboratory Mainframe circuit. It shows all 18 current Mainframe bonuses and 24 jewels at their data coordinates, imports character Lab levels and current positions, and searches for a connected placement covering the most available nodes.

**Live page:** https://stimdesu.github.io/idleon-lab-route/

## Use

Visit the GitHub Pages link, or serve the repository root with a local HTTP server. Paste Raw Game JSON from IdleOn Efficiency, select a JSON file, or load a published profile by username. The profile request goes straight from the browser to `cdn.idleonefficiency.com`. No save data is uploaded to this repository or a project server.

The importer reads character Lab level from `Lv0_i[12]`, Mainframe coordinates from `Lab[0]`, and jewel ownership from `Lab[14]`. It understands the raw-array fields used by current IdleOn Toolbox parsing. Raw exports differ; if those fields are missing, edit Lab level/line width and check jewel ownership in the controls.

## Model and limits

- Coordinates and node descriptions come from [IdleOn Toolbox shared data](https://github.com/Morta1/IdleonToolbox/blob/main/data/website-data/shared-data.json). Their laboratory parser documents the save shape, connection distance, base line-width equation, and Viral Connection/Pyrite Rhombol range effects: [lab.ts](https://github.com/Morta1/IdleonToolbox/blob/main/parsers/world-4/lab.ts).
- The game’s distance calculation is used, as is the Prism start coordinate `(43, 229)`.
- Character line width starts at `50 + 2 × Lab level`; the acquired Sapphire Rhombol modifier is applied near the jewel. Extra flat and percent line/range controls let you include account modifiers that are not reconstructed from the raw save yet.
- “Optimal route” searches positions for the whole imported roster. It follows the in-game rule: an already connected character's own line width reaches the next character. The first account character remains the chain root.
- Set each node to required, optional, or excluded; the search prioritizes required nodes, avoids excluded nodes, and then adds optional nodes.
- The map scrolls horizontally at full coordinate scale. Imported characters use the Cogtimizer head and hat atlas, and the result lists their queue order, coordinates, and line width.
- Set a search time limit and follow the progress bar and final coverage summary. If the limit interrupts beam search, a greedy completion step still places every roster character and tries to add targets.
- The safety margin sets the minimum pixels left before each connection boundary. The results list shows each node's remaining margin or how many pixels it misses by.
- The planner runs beam search across node, jewel, midpoint, and current-position candidates. It finds a strong route from those positions; it does not prove the continuous-coordinate global optimum. Account-specific line-width and node-range bonuses still need the manual modifier controls.
- The Mainframe background and bonus icons are referenced from the pinned IdleOn Toolbox game-asset mirror; the app does not upload save data or modify those assets.
- `assets/head.png`, `assets/hats_board.png`, and the hat mapping are included from [Cogtimizer](https://github.com/StimDesu/cogtimizer), licensed under MIT; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Legends of Idleon and its art belong to Lavaflame2; this is an unofficial fan project.

## Develop

This is a static site. Serve the repository root with any local HTTP server so `data/lab-layout.json` can be fetched, or use GitHub Pages.
