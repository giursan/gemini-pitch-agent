/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { FunctionDeclaration } from '@google/genai';
import { BaseAgent } from '../agents/base_agent.js';
import { BaseTool, RunAsyncToolRequest } from './base_tool.js';
/**
 * The configuration of the agent tool.
 */
export interface AgentToolConfig {
    /**
     * The reference to the agent instance.
     */
    agent: BaseAgent;
    /**
     * Whether to skip summarization of the agent output.
     */
    skipSummarization?: boolean;
}
/**
 * A tool that wraps an agent.
 *
 * This tool allows an agent to be called as a tool within a larger
 * application. The agent's input schema is used to define the tool's input
 * parameters, and the agent's output is returned as the tool's result.
 *
 *  @param config: The configuration of the agent tool.
 */
export declare class AgentTool extends BaseTool {
    private readonly agent;
    private readonly skipSummarization;
    constructor(config: AgentToolConfig);
    _getDeclaration(): FunctionDeclaration;
    runAsync({ args, toolContext }: RunAsyncToolRequest): Promise<unknown>;
}
