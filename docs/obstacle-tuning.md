# Obstacle Tuning

Core obstacle tuning lives in `src/obstacleTuning.js`. The shared six-row geometry is in `src/rowGeometry.js`, and authored pattern data is in `src/obstaclePatterns.js`.

Rows are numbered from top to bottom, `0` through `5`. Row centers are derived from `CONFIG.SURF_BOUNDS`, so change the playable area in `src/config.js` instead of hardcoding Y positions.

To change an ordinary obstacle row, edit the `hit(row, timeOffset, typeId)` entries in `src/obstaclePatterns.js`. To change pattern order, edit the `schedule` array for the relevant ready tier in `src/obstacleTuning.js`.

## Swimmer Difficulty

Swimmer difficulty is defined as five long-term authoring envelopes in `SWIMMER_TIERS`. A tier is the maximum permitted difficulty envelope for authored content. A `SwimmerSection` may soften that tier with overrides, but it must not exceed the tier ceiling.

The authoritative six-row geometry remains unchanged. Rows are still the shared top-to-bottom rows `0` through `5`, and every authored pattern must use those rows and retain a validated viable route.

Current tier envelopes:

| Tier | Name | Content | Speed | Spawn delay | Row release | Release progress | Max active per row |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| 1 | `foundation` | ready/playable | `180` | `0.78` | `fade` | `1.00` | `1` |
| 2 | `weave` | ready/playable | `230` | `0.58` | `progress` | `0.60` | `2` |
| 3 | `pressure` | ready/playable | `260` | `0.46` | `progress` | `0.50` | `2` |
| 4 | `advanced` | planned/non-playable | `290` | `0.40` | `progress` | `0.45` | `2` |
| 5 | `expert` | planned/non-playable | `320` | `0.34` | `progress` | `0.40` | `2` |

Tiers 1-3 currently contain playable schedules. Tiers 4-5 are defined only as future envelopes; they intentionally have no authored schedules yet and cannot be used by `SwimmerSection` until playable content is created.

The live game still uses the legacy three-stage compatibility cadence:

| Legacy stage | Swimmer tier |
| --- | --- |
| Stage 0 | Tier 1 |
| Stage 1 | Tier 2 |
| Stage 2 | Tier 3 |

Normalized route progress is `0.0` at obstacle entry and `1.0` at the submerge endpoint. Lower release thresholds make patterns denser. Increase density first with row choices and `timeOffset`; raise speeds only after the route still validates.

Tier 4 and Tier 5 numeric values are initial authoring ceilings. They should be playtested and tuned when their actual swimmer patterns, and any future deterministic kayak or waverunner blocker classes, are implemented.

Difficulty should primarily come from pattern structure, speed, spacing, cadence, sequencing, and controlled row reuse. Do not increase same-row stacking above two active swimmers, and do not use randomness or impossible walls to create pressure.

For readable two-row surfer openings, prefer adjacent open rows and avoid blocking all but one row at the same timestamp. Diagonal patterns should give the surfer enough horizontal travel time to move vertically between openings.

Useful first knobs:

- `spawnDelaySeconds` in `SWIMMER_TIERS`
- `releaseProgress` for ready tiers
- `maxActivePerRow`
- pattern `timeOffset` values
- individual pattern order in each ready tier schedule

Debug controls default off in `src/config.js`:

- `DEBUG_OBSTACLE_ROWS` draws row centerlines and row numbers.
- `DEBUG` draws collision bounds.
- `DEBUG_START_STAGE` can start a run at a later stage.
- `DEBUG_REDUCED_SPEED_MULTIPLIER` slows or speeds inspection runs.

Runs using stage skipping or reduced speed are treated as non-scoring.

Run validation and regression tests with:

```sh
npm test
```
