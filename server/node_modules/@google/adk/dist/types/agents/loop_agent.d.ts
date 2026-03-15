/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Event } from '../events/event.js';
import { BaseAgent, BaseAgentConfig } from './base_agent.js';
import { InvocationContext } from './invocation_context.js';
/**
 * The configuration options for creating a loop agent.
 */
export interface LoopAgentConfig extends BaseAgentConfig {
    /**
     * The maximum number of iterations the loop agent will run.
     *
     * If not provided, the loop agent will run indefinitely.
     */
    maxIterations?: number;
}
/**
 * A shell agent that run its sub-agents in a loop.
 *
 * When sub-agent generates an event with escalate or max_iterations are
 * reached, the loop agent will stop.
 */
export declare class LoopAgent extends BaseAgent {
    private readonly maxIterations;
    constructor(config: LoopAgentConfig);
    protected runAsyncImpl(context: InvocationContext): AsyncGenerator<Event, void, void>;
    protected runLiveImpl(context: InvocationContext): AsyncGenerator<Event, void, void>;
}
