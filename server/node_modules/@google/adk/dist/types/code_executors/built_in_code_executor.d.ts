import { LlmRequest } from '../models/llm_request.js';
import { BaseCodeExecutor, ExecuteCodeParams } from './base_code_executor.js';
import { CodeExecutionResult } from './code_execution_utils.js';
/**
 * A code executor that uses the Model's built-in code executor.
 *
 * Currently only supports Gemini 2.0+ models, but will be expanded to
 * other models.
 */
export declare class BuiltInCodeExecutor extends BaseCodeExecutor {
    executeCode(params: ExecuteCodeParams): Promise<CodeExecutionResult>;
    processLlmRequest(llmRequest: LlmRequest): void;
}
