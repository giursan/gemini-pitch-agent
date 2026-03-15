/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
class BasePlugin {
  /**
   * Initializes the plugin.
   *
   * @param name A unique identifier for this plugin instance.
   */
  constructor(name) {
    this.name = name;
  }
  /**
   * Callback executed when a user message is received before an invocation
   * starts.
   *
   * This callback helps logging and modifying the user message before the
   * runner starts the invocation.
   *
   * @param invocationContext The context for the entire invocation.
   * @param userMessage The message content input by user.
   * @returns An optional `Content` to be returned to the ADK. Returning a
   *     value to replace the user message. Returning `undefined` to proceed
   *     normally.
   */
  async onUserMessageCallback({ invocationContext, userMessage }) {
    return;
  }
  /**
   * Callback executed before the ADK runner runs.
   *
   * This is the first callback to be called in the lifecycle, ideal for global
   * setup or initialization tasks.
   *
   * @param invocationContext The context for the entire invocation, containing
   *     session information, the root agent, etc.
   * @returns An optional `Event` to be returned to the ADK. Returning a value
   *     to halt execution of the runner and ends the runner with that event.
   *     Return `undefined` to proceed normally.
   */
  async beforeRunCallback({ invocationContext }) {
    return;
  }
  /**
   * Callback executed after an event is yielded from runner.
   *
   * This is the ideal place to make modification to the event before the event
   * is handled by the underlying agent app.
   *
   * @param invocationContext The context for the entire invocation.
   * @param event The event raised by the runner.
   * @returns An optional value. A non-`undefined` return may be used by the
   *     framework to modify or replace the response. Returning `undefined`
   *     allows the original response to be used.
   */
  async onEventCallback({ invocationContext, event }) {
    return;
  }
  /**
   * Callback executed after an ADK runner run has completed.
   *
   * This is the final callback in the ADK lifecycle, suitable for cleanup,
   * final logging, or reporting tasks.
   *
   * @param invocationContext The context for the entire invocation.
   * @returns undefined
   */
  async afterRunCallback({ invocationContext }) {
    return;
  }
  /**
   * Callback executed before an agent's primary logic is invoked.
   *
   * This callback can be used for logging, setup, or to short-circuit the
   * agent's execution by returning a value.
   *
   * @param agent The agent that is about to run.
   * @param callbackContext The context for the agent invocation.
   * @returns An optional `Content` object. If a value is returned, it will
   *     bypass the agent's callbacks and its execution, and return this value
   *     directly. Returning `undefined` allows the agent to proceed normally.
   */
  async beforeAgentCallback({ agent, callbackContext }) {
    return;
  }
  /**
   * Callback executed after an agent's primary logic has completed.
   *
   * This callback can be used to inspect, log, or modify the agent's final
   * result before it is returned.
   *
   * @param agent The agent that has just run.
   * @param callbackContext The context for the agent invocation.
   * @returns An optional `Content` object. If a value is returned, it will
   *     replace the agent's original result. Returning `undefined` uses the
   *     original, unmodified result.
   */
  async afterAgentCallback({ agent, callbackContext }) {
    return;
  }
  /**
   * Callback executed before a request is sent to the model.
   *
   * This provides an opportunity to inspect, log, or modify the `LlmRequest`
   * object. It can also be used to implement caching by returning a cached
   * `LlmResponse`, which would skip the actual model call.
   *
   * @param callbackContext The context for the current agent call.
   * @param llmRequest The prepared request object to be sent to the model.
   * @returns An optional value. The interpretation of a non-`undefined`
   *     trigger an early exit and returns the response immediately. Returning
   *     `undefined` allows the LLM request to proceed normally.
   */
  async beforeModelCallback({ callbackContext, llmRequest }) {
    return;
  }
  /**
   * Callback executed after a response is received from the model.
   *
   * This is the ideal place to log model responses, collect metrics on token
   * usage, or perform post-processing on the raw `LlmResponse`.
   *
   * @param callbackContext The context for the current agent call.
   * @param llmResponse The response object received from the model.
   * @returns An optional value. A non-`undefined` return may be used by the
   *     framework to modify or replace the response. Returning `undefined`
   *     allows the original response to be used.
   */
  async afterModelCallback({ callbackContext, llmResponse }) {
    return;
  }
  /**
   * Callback executed when a model call encounters an error.
   *
   * This callback provides an opportunity to handle model errors gracefully,
   * potentially providing alternative responses or recovery mechanisms.
   *
   * @param callbackContext The context for the current agent call.
   * @param llmRequest The request that was sent to the model when the error
   *     occurred.
   * @param error The exception that was raised during model execution.
   * @returns An optional LlmResponse. If an LlmResponse is returned, it will be
   *     used instead of propagating the error. Returning `undefined` allows
   *     the original error to be raised.
   */
  async onModelErrorCallback({ callbackContext, llmRequest, error }) {
    return;
  }
  /**
   * Callback executed before a tool is called.
   *
   * This callback is useful for logging tool usage, input validation, or
   * modifying the arguments before they are passed to the tool.
   *
   * @param tool The tool instance that is about to be executed.
   * @param toolArgs The dictionary of arguments to be used for invoking the
   *     tool.
   * @param toolContext The context specific to the tool execution.
   * @returns An optional dictionary. If a dictionary is returned, it will stop
   *     the tool execution and return this response immediately. Returning
   *     `undefined` uses the original, unmodified arguments.
   */
  async beforeToolCallback({ tool, toolArgs, toolContext }) {
    return;
  }
  /**
   * Callback executed after a tool has been called.
   *
   * This callback allows for inspecting, logging, or modifying the result
   * returned by a tool.
   *
   * @param tool The tool instance that has just been executed.
   * @param toolArgs The original arguments that were passed to the tool.
   * @param toolContext The context specific to the tool execution.
   * @param result The dictionary returned by the tool invocation.
   * @returns An optional dictionary. If a dictionary is returned, it will
   *     **replace** the original result from the tool. This allows for
   *     post-processing or altering tool outputs. Returning `undefined` uses
   *     the original, unmodified result.
   */
  async afterToolCallback({ tool, toolArgs, toolContext, result }) {
    return;
  }
  /**
   * Callback executed when a tool call encounters an error.
   *
   * This callback provides an opportunity to handle tool errors gracefully,
   * potentially providing alternative responses or recovery mechanisms.
   *
   * @param tool The tool instance that encountered an error.
   * @param toolArgs The arguments that were passed to the tool.
   * @param toolContext The context specific to the tool execution.
   * @param error The exception that was raised during tool execution.
   * @returns An optional dictionary. If a dictionary is returned, it will be
   *     used as the tool response instead of propagating the error. Returning
   *     `undefined` allows the original error to be raised.
   */
  async onToolErrorCallback({ tool, toolArgs, toolContext, error }) {
    return;
  }
}
export {
  BasePlugin
};
