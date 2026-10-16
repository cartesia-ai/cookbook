---
title: Webhook tools
source: https://docs.cartesia.ai/agents/webhook-tools
fetched: 2026-10-16
---

# Webhook tools

> Let an agent call an HTTPS endpoint on your server.

Webhook tools connect an agent to your systems. When the model calls one, Cartesia sends an HTTP request to your endpoint and returns the response to the model.

## Define a webhook tool

Create a webhook tool by sending this request body to [`POST /v1/agents/tools`](/api-reference/agents/tools/create). The outer fields define the tool and its execution settings. The nested `api_schema` describes the separate outbound HTTPS request that Cartesia sends to your API when the LLM invokes the tool. In `api_schema`, supply `method` and `url`, plus any path parameters, query parameters, JSON body, headers, or authentication that your API requires.

```json POST /v1/agents/tools
{
  "type": "webhook",
  "name": "lookup_order",
  "description": "Looks up an order by its number. Use it when the caller asks about order status or delivery.",
  "pre_tool_speech": "auto",
  "execution_mode": "immediate",
  "response_timeout_secs": 20,
  "api_schema": {
    "url": "https://api.acme.com/orders/{order_id}",
    "method": "GET",
    "path_params_schema": {
      "order_id": {
        "type": "string",
        "description": "Order number provided by the caller."
      }
    },
    "request_headers": {
      "X-Tenant": "acme"
    },
    "authentication": {
      "mode": "bearer",
      "token": {
        "type": "secret",
        "secret_value": "sk_live_..."
      }
    }
  }
}
```

Attach the returned tool ID through `config.tools`. See [Tools](/agents/tools#execution-settings) for the shared execution settings.

## api\_schema

`api_schema.url` must use HTTPS, and requests to private and internal network ranges are blocked. `api_schema.method` supports `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`.

* `api_schema.path_params_schema` fills placeholders in `api_schema.url`, such as `{order_id}`. Every `{placeholder}` in `api_schema.url` must have an entry with the same case-sensitive name in `api_schema.path_params_schema`. Each path parameter is required and may be a string, integer, or number.
* `api_schema.query_params_schema` describes query parameters with `properties` and an optional `required` list. Each property name becomes a query-string key; these names do not map to placeholders in `api_schema.url`.
* `api_schema.request_body_schema` describes a JSON object for `POST`, `PUT`, or `PATCH`. Body properties may be nested.

Choose how each parameter gets its value:

| Value source | Configuration |
| - | - |
| Model | Use `description` to explain what to provide, and optionally `enum` to constrain values |
| Fixed value | Set `constant_value`, such as a tenant ID or API version |
| Dynamic variable | Set `dynamic_variable` to the [variable's name](/agents/dynamic-variables) |

Parameter descriptions tell the model what value to provide. Use `constant_value` for a value the model should not choose, such as an API version. Use `dynamic_variable` values for per-customer context or values fetched at runtime.

For example, this tool sends the current `customer_id` with each request:

```json POST /v1/agents/tools
{
  "type": "webhook",
  "name": "track_order",
  "description": "Track an order using the caller's order number and customer account.",
  "pre_tool_speech": "auto",
  "execution_mode": "immediate",
  "api_schema": {
    "url": "https://api.example.com/orders/track",
    "method": "POST",
    "request_body_schema": {
      "type": "object",
      "properties": {
        "order_id": {
          "type": "string",
          "description": "Order number provided by the caller."
        },
        "customer_id": { "type": "string", "dynamic_variable": "customer_id" },
        "region": { "type": "string", "constant_value": "us-east" }
      },
      "required": ["order_id"]
    }
  }
}
```

Dynamic variables can fill string, number, and boolean fields, including fields within an object. They cannot fill an entire object, a list, or fields within a list.

Tool and parameter descriptions can also use dynamic variables. For example, add `Last known status: {{order_status}}` to the tool description so the model can see the value too.

## Headers and authentication

`api_schema.request_headers` accepts strings, secrets, and dynamic variables. Add headers with [`PATCH /v1/agents/tools/{tool_id}`](/api-reference/agents/tools/update), using your tool ID and API credential:

```json PATCH /v1/agents/tools/{tool_id}
{
  "api_schema": {
    "request_headers": {
      "X-Tenant": "acme",
      "X-Api-Key": {
        "type": "secret",
        "secret_value": "..."
      },
      "X-Customer-Id": {
        "type": "dynamic_variable",
        "name": "customer_id"
      }
    }
  }
}
```

`authentication` adds credentials to the `Authorization` header at request time. `bearer` sends `Authorization: Bearer <token>`, and `basic_auth` sends `Authorization: Basic <base64(username:password)>`. Do not also set `Authorization` in `request_headers`.

The API never returns saved secret values. When updating a tool, omitted headers and authentication stay unchanged. If you include an existing secret field, use `{ "type": "secret" }` without `secret_value` to keep its value.

To remove a header, set that header to `null` inside `api_schema.request_headers`. To remove authentication, set `api_schema.authentication` to `null`.

Cartesia reserves transport headers that it manages itself. Header names must be unique, regardless of capitalization.

## Responses and timeouts

For a successful request (2xx) with a textual response body, the body becomes the result given to the LLM. Return only the data the LLM needs. Cartesia limits the body to 4096 bytes and adds `[cut off: the response was longer than this tool returns]` if it is longer.

Use `assignments` to save response fields as dynamic variables. For a response such as `{"order": {"id": "A-1001", "status": "shipped"}}`, the assignments below save the order ID and status. Configure them in the tool's side panel in the Playground or with [`PATCH /v1/agents/tools/{tool_id}`](/api-reference/agents/tools/update):

```json PATCH /v1/agents/tools/{tool_id}
{
  "assignments": [
    { "dynamic_variable": "order_status", "value_path": "order.status" },
    { "dynamic_variable": "order_id", "value_path": "order.id" }
  ]
}
```

Assignments apply after a successful JSON response. A failed request, missing field, or `null` value leaves the previous variable value unchanged. Objects and lists are saved as JSON text.

The request times out after `response_timeout_secs`, which defaults to 20 seconds. If the request times out, the endpoint cannot be reached, or the endpoint returns a non-2xx status, Cartesia gives the LLM an error result describing the failure and the conversation continues. Use `execution_mode: "async"` for requests that do not need to block the current turn.
