# IdleOn Lab Route Planner

Browser tool for planning the World 4 Laboratory Mainframe circuit. It shows all 18 current Mainframe bonuses and 24 jewels at their data coordinates, imports character Lab levels and current positions, and searches for a connected placement covering the most available nodes.

**Live page:** https://stimdesu.github.io/idleon-lab-route/

## Use

Visit the GitHub Pages link or open `index.html` directly from disk. The static map and character artwork are bundled locally, so raw JSON and icons work without a local server; profile-name lookup needs an internet connection. Paste Raw Game JSON from IdleOn Efficiency, select a JSON file, or load a published profile by username. The profile request goes straight from the browser to `cdn.idleonefficiency.com`. No save data is uploaded to this repository or a project server.

The importer reads character Lab level from `Lv0_i[12]`, Mainframe coordinates from `Lab[0]`, and jewel ownership from `Lab[14]`. It understands the raw-array fields used by current IdleOn Toolbox parsing. Raw exports differ; if those fields are missing, edit Lab level/line width and check jewel ownership in the controls.

## Model and limits

- Coordinates and node descriptions come from [IdleOn Toolbox shared data](https://github.com/Morta1/IdleonToolbox/blob/main/data/website-data/shared-data.json). Their laboratory parser documents the save shape, connection distance, base line-width equation, and Viral Connection/Pyrite Rhombol range effects: [lab.ts](https://github.com/Morta1/IdleonToolbox/blob/main/parsers/world-4/lab.ts).
- Connection geometry is verified against the local game bundle: distance is `.9604339 × max(dx,dy) + .397824735 × min(dx,dy)`, forming an exact octagon in map coordinates. Prism-to-character uses the candidate's line width. For each character added to an existing chain, the game compares the distance to that new character's line width; it does not use the parent's width or the minimum of the pair. Character-to-node capture uses the node's separate Mainframe range formula (usually 80 px, with fixed exceptions). The first roster character in range of the Prism seeds the chain; optimal mode selects a seed and keeps earlier roster characters outside Prism range.
- Character line width starts at `50 + 2 × Lab level`; the `GemItemsPurchased[123]` tube bonus and the `Crystal3` card level (up to +50 px) is read from the save. The local Sapphire Rhombol effect is applied by planned position. Enter the exact in-game line width per character to include meals, higher card levels, chips, shiny bonuses, and Purple Tube effects; an exact override takes precedence over the general modifiers.
- “Optimal route” searches positions and connection order for the whole imported roster. It follows the in-game directed rule: a new character joins when it is within that new character's own line width of an already-connected character. The game seeds from the first eligible roster slot in Prism range; earlier slots are kept outside Prism range when a later slot is selected as the planned seed.
- Set each node to required, optional, or excluded; the search prioritizes required nodes, avoids excluded nodes, and then adds optional nodes.
- The map scrolls horizontally at full coordinate scale. Imported characters use the Cogtimizer head and hat atlas, and the result lists their queue order, coordinates, and line width.
- Set a search time limit and follow the progress bar and final coverage summary. If the limit interrupts beam search, a greedy completion step still places every roster character and tries to add targets.
- The route uses the full in-game connection radius; every emitted link is rechecked and rendered, and the results list shows the actual remaining margin or miss distance for each node. Roster numbers always match save slots even when the optimal route uses a different connection order. The map shows save coordinates, pointer coordinates, and each suggested point's offset from its nearest node.
- Candidate positions include intersections of node capture boundaries, square-tile edges, Prism, and current positions. The search excludes game node tiles from placement: bonus tiles use their 76 px image bounds (including the 6 px frame offset) and owned jewel tiles use 68 px. It prevents duplicate coordinates but does not impose a fake 32 px player collision rule; among equal-coverage routes it prefers more separated positions. The planner runs beam search over connected chains and uses a greedy completion if the time limit interrupts it. It returns the best route found within the limit; it does not prove the continuous-coordinate global optimum. Account-specific node-range bonuses remain available in the manual controls.
- Mainframe background and bonus icons from the pinned IdleOn Toolbox game-asset mirror are bundled in `assets/idleon/` for offline use. The app does not upload save data or modify those assets.
- `assets/head.png`, `assets/hats_board.png`, and the hat mapping are included from [Cogtimizer](https://github.com/StimDesu/cogtimizer), licensed under MIT; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Legends of Idleon and its art belong to Lavaflame2; this is an unofficial fan project.

## Develop

This is a static site. Serve the repository root with any local HTTP server so `data/lab-layout.json` can be fetched, or use GitHub Pages.
