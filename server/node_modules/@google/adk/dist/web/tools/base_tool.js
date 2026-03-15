/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { getGoogleLlmVariant } from "../utils/variant_utils.js";
class BaseTool {
  /**
   * Base constructor for a tool.
   *
   * @param params The parameters for `BaseTool`.
   */
  constructor(params) {
    var _a;
    this.name = params.name;
    this.description = params.description;
    this.isLongRunning = (_a = params.isLongRunning) != null ? _a : false;
  }
  /**
   * Gets the OpenAPI specification of this tool in the form of a
   * FunctionDeclaration.
   *
   * NOTE
   * - Required if subclass uses the default implementation of
   *   `processLlmRequest` to add function declaration to LLM request.
   * - Otherwise, can be skipped, e.g. for a built-in GoogleSearch tool for
   *   Gemini.
   *
   * @return The FunctionDeclaration of this tool, or undefined if it doesn't
   *     need to be added to LlmRequest.config.
   */
  _getDeclaration() {
    return void 0;
  }
  /**
   * Processes the outgoing LLM request for this tool.
   *
   * Use cases:
   * - Most common use case is adding this tool to the LLM request.
   * - Some tools may just preprocess the LLM request before it's sent out.
   *
   * @param request The request to process the LLM request.
   */
  async processLlmRequest({ toolContext, llmRequest }) {
    const functionDeclaration = this._getDeclaration();
    if (!functionDeclaration) {
      return;
    }
    llmRequest.toolsDict[this.name] = this;
    const tool = findToolWithFunctionDeclarations(llmRequest);
    if (tool) {
      if (!tool.functionDeclarations) {
        tool.functionDeclarations = [];
      }
      tool.functionDeclarations.push(functionDeclaration);
    } else {
      llmRequest.config = llmRequest.config || {};
      llmRequest.config.tools = llmRequest.config.tools || [];
      llmRequest.config.tools.push({
        functionDeclarations: [functionDeclaration]
      });
    }
  }
  /**
   * The Google API LLM variant to use.
   */
  get apiVariant() {
    return getGoogleLlmVariant();
  }
}
function findToolWithFunctionDeclarations(llmRequest) {
  var _a;
  return (((_a = llmRequest.config) == null ? void 0 : _a.tools) || []).find((tool) => "functionDeclarations" in tool);
}
export {
  BaseTool
};
