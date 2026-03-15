/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Event } from '../events/event.js';
import { BaseAgent } from './base_agent.js';
import { InvocationContext } from './invocation_context.js';
/**
 * A shell agent that run its sub-agents in parallel in isolated manner.
 *
 * This approach is beneficial for scenarios requiring multiple perspectives or
 * attempts on a single task, such as:
 *
 *  - Running different algorithms simultaneously.
 *  - Generating multiple responses for review by a subsequent evaluation agent.
 */
export declare class ParallelAgent extends BaseAgent {
    protected runAsyncImpl(context: InvocationContext): AsyncGenerator<Event, void, void>;
    protected runLiveImpl(context: InvocationContext): AsyncGenerator<Event, void, void>;
}
