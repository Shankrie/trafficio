# Trafficio – learn traffic rules by driving

A top-down 2D driving game that teaches the **Lithuanian traffic rules (KET – Kelių eismo taisyklės)**.
Each level puts you behind the wheel in one or more traffic situations. Drive the route without
breaking a rule to unlock the next level. Any violation ends the attempt and explains which rule you broke.

## Play

Open `index.html` in a browser. There is no build step or server; double-clicking the file works.

| Key | Action |
| --- | --- |
| ↑ / W | accelerate |
| ↓ / S | brake (hold to reverse) |
| ← → / A D | steer |
| Q / E | left / right turn indicator (cancels after the turn) |
| Space | hard brake |
| R | restart level |
| Esc / P | pause |

Touch devices get on-screen buttons.

URL options: `?level=N` jumps straight to level N; `?all` unlocks all levels.

## Levels

| # | Level | Rules practised |
|---|---|---|
| 1 | First metres (Pirmieji metrai) | right-hand traffic, stay on the carriageway, park |
| 2 | Speed limits (Greičio ribojimas) | 90 km/h outside / 50 km/h inside built-up areas, 30 zone near a school |
| 3 | Turn signals (Posūkio signalai) | indicate before turning, no misleading signals |
| 4 | Pedestrian crossings (Pėsčiųjų perėjos) | give way to pedestrians at zebra crossings |
| 5 | Traffic lights (Šviesoforai) | red, red + yellow, yellow and green |
| 6 | STOP sign (Ženklas STOP) | full stop at the line, give way to the main road |
| 7 | Give way & main road | "Duoti kelią", turning left across traffic, priority on the main road |
| 8 | Equal junction | the right-hand rule (dešinės rankos taisyklė) |
| 9 | Turning left (Posūkis į kairę) | give way to oncoming traffic on green |
| 10 | Level crossings (Geležinkelio pervažos) | flashing lights and barriers, STOP at unguarded crossings |
| 11 | Roundabout (Žiedinė sankryža) | give way to circulating traffic, signal right before the exit |
| 12 | Final exam | everything above on one route |

## How rules are checked

All checks run every frame in `js/game.js` (`Game.checkRules`):

- **Lane discipline:** on two-way roads the car must stay right of the centre line.
- **Off-road:** the car may not leave the carriageway.
- **Speed:** the limit comes from level defaults and speed zones; going more than 4 km/h over for more than about 1 s is a violation.
- **Indicators:** the turn through every junction with three or more arms is classified as left, right or straight. Turns need the matching indicator, switched on at least 0.5 s before entering the junction. Going straight with an indicator on is a violation. At roundabouts the right indicator is required when leaving.
- **Stop lines:** STOP signs need a full stop (0 km/h). Traffic lights follow the Lithuanian sequence; the yellow check considers whether you could have stopped. Level crossings must not be entered while the lights flash.
- **Give way:** a level can define conflict and watch zones. Entering a conflict zone while a priority vehicle is approaching in a watch zone, or is already inside the conflict zone, is a violation.
- **Pedestrians:** you may not enter a zebra crossing while a pedestrian is on it or stepping onto it.

## Code layout

```
index.html        UI (menus, briefing, results, HUD overlay, touch controls)
js/geometry.js    units, vector/rect helpers, paths
js/world.js       road network, junction detection, markings, lights, railway, map rendering
js/agents.js      AI cars, pedestrians and trains; vehicle drawing
js/signs.js       Lithuanian road signs (canvas drawings + names)
js/rules.js       violation explanations (KET)
js/game.js        player car physics, rule checks, camera, HUD
js/levels.js      level definitions
js/main.js        progress (localStorage), menus, input, main loop
```

### Adding a level

Add an entry to `LEVELS` in `js/levels.js`. `build(W)` creates roads with `W.hroad` and `W.vroad`; junctions are detected automatically.
It then adds markings and signs (`W.zebra`, `W.stopSign`, `W.light`, `W.roadSign`), traffic (`W.spawner`, `W.agent`), rules (`W.yieldRule`, `W.speedZone`)
and finally `W.start`, `W.setRoute` and `W.goalAt`. Lane coordinates come from `road.lane(heading)`.

The game is designed so other countries' rules can be added later (signs, rule texts and levels are kept separate from the engine).

*Disclaimer: this is a learning aid, not an official KET reference. Always consult the current official Kelių eismo taisyklės.*
