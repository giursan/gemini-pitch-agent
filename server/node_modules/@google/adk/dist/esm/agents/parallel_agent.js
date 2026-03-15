/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseAgent } from "./base_agent.js";
import { InvocationContext } from "./invocation_context.js";
class ParallelAgent extends BaseAgent {
  async *runAsyncImpl(context) {
    const agentRuns = this.subAgents.map(
      (subAgent) => subAgent.runAsync(
        createBranchCtxForSubAgent(this, subAgent, context)
      )
    );
    for await (const event of mergeAgentRuns(agentRuns)) {
      yield event;
    }
  }
  async *runLiveImpl(context) {
    throw new Error("This is not supported yet for ParallelAgent.");
  }
}
function createBranchCtxForSubAgent(agent, subAgent, originalContext) {
  const invocationContext = new InvocationContext(originalContext);
  const branchSuffix = `${agent.name}.${subAgent.name}`;
  invocationContext.branch = invocationContext.branch ? `${invocationContext.branch}.${branchSuffix}` : branchSuffix;
  return invocationContext;
}
async function* mergeAgentRuns(agentRuns) {
  const pendingPromises = /* @__PURE__ */ new Map();
  for (const [index, generator] of agentRuns.entries()) {
    const promise = generator.next().then((result) => ({ result, index }));
    pendingPromises.set(index, promise);
  }
  while (pendingPromises.size > 0) {
    const { result, index } = await Promise.race(pendingPromises.values());
    if (result.done) {
      pendingPromises.delete(index);
      continue;
    }
    yield result.value;
    const nextPromise = agentRuns[index].next().then((result2) => ({ result: result2, index }));
    pendingPromises.set(index, nextPromise);
  }
}
export {
  ParallelAgent
};
