/**
 * worker.ts — placeholder entry point for future Bun Worker use.
 *
 * When Bun Worker threads become stable, this file will be loaded inside a
 * Worker context. For now it is a no-op placeholder so the module graph is
 * complete and imports resolve without error.
 *
 * The current parallelism strategy (Promise-based batching in
 * ParallelSearchManager) does not require a worker entry point, but having
 * this file ready means the migration path to real threads will be minimal:
 *   1. Move the runBacktest logic here.
 *   2. Replace the Promise-based dispatcher in ParallelSearchManager with
 *      a pool of `new Worker(import.meta.url)` instances.
 *
 * No exports are required by the current implementation.
 */

// Guard: this file must not be the main entry point for the daemon or web
// server — it is reserved for Worker thread use only.
if (typeof self !== "undefined" && "postMessage" in self) {
  // Running inside a Bun/Web Worker context — future message handler goes here.
  // @ts-ignore — self.onmessage is valid in worker context
  self.onmessage = (_event: MessageEvent): void => {
    // TODO: deserialise ParamSet, call runBacktest, postMessage result back
  };
}
