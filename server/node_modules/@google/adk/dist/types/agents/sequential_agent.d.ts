/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Event } from '../events/event.js';
import { BaseAgent } from './base_agent.js';
import { InvocationContext } from './invocation_context.js';
/**
 * A shell agent that runs its sub-agents in a sequential order.
 */
export declare class SequentialAgent extends BaseAgent {
    protected runAsyncImpl(context: InvocationContext): AsyncGenerator<Event, void, void>;
    /**
     * Implementation for live SequentialAgent.
     *
     * Compared to the non-live case, live agents process a continuous stream of
     * audio or video, so there is no way to tell if it's finished and should pass
     * to the next agent or not. So we introduce a task_completed() function so
     * the model can call this function to signal that it's finished the task and
     * we can move on to the next agent.
     *
     * @param context: The invocation context of the agent.
     */
    protected runLiveImpl(context: InvocationContext): AsyncGenerator<Event, void, void>;
}
