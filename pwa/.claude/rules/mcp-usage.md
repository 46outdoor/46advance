---
paths:
  - "**/*"
---

# MCP Usage — Token Efficiency & Best Practices

MCP tools are powerful but expensive. Every tool schema injected into context
consumes tokens. This project plans to use Chrome DevTools MCP and may add more
servers over time. Follow these rules to minimize token waste.

## Core Principle: Minimize Tool Schema Exposure

The biggest MCP cost is not execution — it's disclosure. Each tool's schema is
injected into the context window before you even use it. With dozens of tools,
this can consume thousands of tokens per turn doing nothing.

### Dynamic Discovery Pattern

1. **Know what you need before calling.** Don't browse tool lists. Identify the action, then call the right tool directly.
2. **Prefer snapshots over screenshots.** `take_snapshot` returns structured text (smaller footprint). Use `take_screenshot` only when visual layout matters.
3. **Batch related operations.** Make multiple independent MCP calls in parallel rather than sequential round-trips.
4. **Don't re-discover tools you've already used.** Once a tool is in context, reuse it.

## Chrome DevTools MCP — Efficient Usage

The Chrome DevTools MCP server exposes 25+ tools. Most sessions only need 3–5.

### High-Value Tools (Use These First)

| Tool | Token Cost | Use When |
|------|-----------|----------|
| `take_snapshot` | Low (text) | Layout verification, element finding, a11y checks |
| `evaluate_script` | Low | Reading DOM state, running assertions, extracting data |
| `navigate_page` | Low | Page navigation |
| `click` / `fill` | Low | User interaction simulation |
| `list_console_messages` | Low | Error detection |

### Expensive Tools (Use Sparingly)

| Tool | Token Cost | Use Only When |
|------|-----------|--------------|
| `take_screenshot` | High (image) | Visual regression, layout debugging text can't capture |
| `performance_start_trace` | High | Explicit performance profiling requests |
| `list_network_requests` | Medium-High | Network debugging, API verification |
| `get_network_request` | Medium-High | Inspecting specific request/response bodies |

### Anti-Patterns

- **Don't take a screenshot to read text.** Use `take_snapshot` (a11y tree as structured text).
- **Don't list all network requests to find one.** Filter `list_network_requests` with `resourceTypes`.
- **Don't poll with `take_snapshot` repeatedly.** Use `wait_for` to wait for specific text, then snapshot once.
- **Don't take full-page screenshots.** Use element-scoped screenshots (`uid`) when possible.

### Efficient Patterns

```
# Bad: screenshot to check if text appeared
take_screenshot → "is the success message showing?"

# Good: targeted wait
wait_for text="Success" → take_snapshot (only if more context needed)

# Bad: list all requests then filter
list_network_requests → (scan through 50 requests)

# Good: filtered request list
list_network_requests resourceTypes=["fetch","xhr"] → (only API calls)
```

## MCP Configuration

| Scope | File | Use |
|-------|------|-----|
| Global (all projects) | `~/.claude.json` → `mcpServers` | Servers you use everywhere |
| Project-level | `~/.claude.json` → `projects[path].mcpServers` | Project-specific servers |
| Codex | `.codex/config.toml` | Codex MCP config + per-tool approval modes |
| Permissions | `.claude/settings.local.json` | Allow/deny MCP tool access |

### Adding New MCP Servers

1. **Justify the addition.** Each server adds tool schemas to every session's context. Only add servers that provide capabilities not available through existing tools (WebFetch already handles URLs; Bash handles shell).
2. **Scope permissions narrowly.** Prefer specific tool permissions (`mcp__server__tool`) over wildcards (`mcp__server__*`).
3. **Document the server.** Add its purpose, key tools, and usage patterns to `guides/MCP_SETUP.md` (create when needed).
4. **Configure at the right level.** Project-only servers use project-level config; everywhere-servers use global.

### Recommended Permission Scoping

```json
{
  "permissions": {
    "allow": [
      "mcp__chrome-devtools__take_snapshot",
      "mcp__chrome-devtools__evaluate_script",
      "mcp__chrome-devtools__navigate_page",
      "mcp__chrome-devtools__click",
      "mcp__chrome-devtools__fill",
      "mcp__chrome-devtools__wait_for",
      "mcp__chrome-devtools__list_console_messages"
    ]
  }
}
```

This allows frequently-used tools automatically while prompting for expensive
operations like screenshots and performance traces.

## When to Disconnect

If a task doesn't need browser interaction (pure code refactoring, test writing,
docs), MCP servers are pure overhead. Use `/mcp` to check connected servers and
disconnect unnecessary ones for long sessions; reconnect when browser interaction
is needed.

## Native Mobile Note

Chrome DevTools MCP does not apply to `../mobile/` native runs — use Expo dev
client logs, Flipper, or Xcode/Android Studio instrumentation instead.
