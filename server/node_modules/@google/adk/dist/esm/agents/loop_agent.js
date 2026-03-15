/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseAgent } from "./base_agent.js";
class LoopAgent extends BaseAgent {
  constructor(config) {
    var _a;
    super(config);
    this.maxIterations = (_a = config.maxIterations) != null ? _a : Number.MAX_SAFE_INTEGER;
  }
  async *runAsyncImpl(context) {
    let iteration = 0;
    while (iteration < this.maxIterations) {
      for (const subAgent of this.subAgents) {
        let shouldExit = false;
        for await (const event of subAgent.runAsync(context)) {
          yield event;
          if (event.actions.escalate) {
            shouldExit = true;
          }
        }
        if (shouldExit) {
          return;
        }
      }
      iteration++;
    }
    return;
  }
  async *runLiveImpl(context) {
    throw new Error("This is not supported yet for LoopAgent.");
  }
}
export {
  LoopAgent
};
