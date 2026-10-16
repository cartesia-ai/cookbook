---
title: Tools
source: https://docs.cartesia.ai/agents/tools
fetched: 2026-10-16
---

# Tools

> Give an agent actions it can invoke during a call.

Tools let an agent end a call, transfer a caller, retrieve data, or trigger another action. The LLM chooses a tool from its name, description, and the conversation.

Tools fall into three kinds:

* **System tools** are built-in Cartesia actions, such as ending a call, that you configure directly on an agent.
* **Webhook tools** call HTTPS endpoints that you expose on your server. Cartesia sends the HTTP request.
* **Client tools** run functions in the browser, mobile app, or server connected to Cartesia over the WebSocket API.

## Attach tools to an agent

Webhook and client tools are shared resources. Create one with [`POST /v1/agents/tools`](/api-reference/agents/tools/create), then add its ID to `config.tools`. An agent can reference up to 32 tools.

An update to `config.tools` replaces the complete list. A referenced tool cannot be deleted until you remove it from every current agent configuration.

[System tools](/agents/system-tools) are configured separately on `config.system_tools`.

## Describe a tool

The LLM uses a tool's `name` and `description` to decide when to invoke it. State what the tool does and when to use it.

```text
Looks up an order by its number. Use it when the caller asks about an order's status or delivery date.
```

## Execution settings

Webhook and client tools use these settings:

| Field | Applies to | Values and default | Behavior |
| - | - | - | - |
| `pre_tool_speech` | Webhook and client tools | Required. Choose `auto`, `force` or `off`; there is no default. | `auto` lets the agent decide whether to speak first. `force` asks it to speak before invoking the tool. `off` doesn't ask it to. |
| `execution_mode` | Webhook and client tools | Required. Choose `immediate` or `async`; there is no default. | `immediate` runs in the current conversation turn and can be interrupted by the caller. `async` runs separately while the turn can finish. |
| `response_timeout_secs` | Webhook tools, and client tools that must return a result | From `1` to `120` seconds. The default is `20`. | Maximum time Cartesia waits for the webhook endpoint or connected browser, mobile app, or server to return a result. |

## Results

Cartesia runs system tools and handles their results.

For a webhook tool, a successful HTTPS response with a textual body passes that body to the LLM as the result. Cartesia limits that body to 4096 bytes and adds `[cut off: the response was longer than this tool returns]` when it is longer. If the endpoint returns a non-2xx status, times out, or cannot be reached, the LLM receives an error result and the conversation continues.

For a client tool that must return a result, the connected browser, mobile app, or server sends a `client_tool_result` message over the WebSocket connection. If no result arrives before `response_timeout_secs`, Cartesia gives the LLM `Tool call timed out`. If the result exceeds 4096 bytes, Cartesia replaces it with an error result whose `error_type` is `result_too_large`.

Built-in actions you configure directly on an agent.

HTTP requests that Cartesia sends to your server.

Functions that the connected browser, mobile app, or server runs over the WebSocket API.
