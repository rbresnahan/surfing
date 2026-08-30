# Obstacle Tuning

Core obstacle tuning lives in `src/obstacleTuning.js`. The shared six-row geometry is in `src/rowGeometry.js`, and authored pattern data is in `src/obstaclePatterns.js`.

Rows are numbered from top to bottom, `0` through `5`. Row centers are derived from `CONFIG.SURF_BOUNDS`, so change the playable area in `src/config.js` instead of hardcoding Y positions.

To change an ordinary obstacle row, edit the `hit(row, timeOffset, typeId)` entries in `src/obstaclePatterns.js`. To change pattern order, edit the `schedule` array for the relevant stage in `src/obstacleTuning.js`.

Difficulty is run-scoped:

- Stage 0 starts every fresh run. A row releases when its previous obstacle begins fading.
- Stage 1 unlocks after the original fisherman encounter. Rows release at `0.60` normalized route progress.
- Stage 2 unlocks after the cooler encounter. Rows release at `0.50` normalized route progress.

Normalized route progress is `0.0` at obstacle entry and `1.0` at the submerge endpoint. Lower release thresholds make patterns denser. Increase density first with row choices and `timeOffset`; raise speeds only after the route still validates.

For readable two-row surfer openings, prefer adjacent open rows and avoid blocking all but one row at the same timestamp. Diagonal patterns should give the surfer enough horizontal travel time to move vertically between openings.

Useful first knobs:

- `spawnDelaySeconds` in `DIFFICULTY_STAGES`
- `releaseProgress` for Stage 1 and Stage 2
- `maxActivePerRow`
- pattern `timeOffset` values
- individual pattern order in each stage schedule

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
