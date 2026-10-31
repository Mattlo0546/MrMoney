<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

### CodeGraph Workflow & Index Maintenance (Mandatory for All Agents)

This repository is indexed with [CodeGraph](https://github.com/colbymchenry/codegraph) (`.codegraph/codegraph.db`, configured via `codegraph.json`). All main agents and delegated subagents MUST follow these rules for fast codebase navigation and keeping the knowledge graph fresh:

1. **Navigate & Retrieve with CodeGraph First:**
   - **MCP (`codegraph_explore`)** or **CLI (`codegraph explore "<query>"` / `pnpm codegraph:explore "<query>"`)**: Always query CodeGraph **before** using `grep`, `find`, or reading multiple files. Pass a natural-language question, symbol name, or file path to get verbatim source code and call-graph paths (including dynamic dispatch) in a single call.
   - **Targeted Graph Commands:**
     - `codegraph context "<task>"` (or `codegraph_context`): Collect relevant symbols and code context for a task.
     - `codegraph callers <symbol>` / `codegraph callees <symbol>`: Trace upstream callers and downstream dependencies.
     - `codegraph impact <symbol>` (or `codegraph_impact`): Inspect the blast radius across `src/lib/engine/`, `src/lib/parser/`, `src/lib/store/`, `src/components/`, and `src/app/` before modifying shared types or functions.
     - `codegraph affected` (or `pnpm codegraph:affected`): Inspect symbols and tests affected by uncommitted/staged changes before committing.

2. **Keep the CodeGraph Index Updated:**
   - **Automatic Sync:**
     - When the CodeGraph MCP server (`codegraph serve --mcp`) is running, OS file watching (`FSEvents`) automatically re-indexes modified files within ~2 seconds.
     - Git hooks (`post-commit`, `post-merge`, `post-checkout`, installed via `pnpm codegraph:setup` / `postinstall`) automatically run `codegraph sync` in the background after commits, merges, and branch checkouts.
   - **Mandatory Agent Sync After Code Changes:**
     - Whenever you (or a subagent) create, rename, delete, or modify source/test files via CLI or file tools, run `codegraph sync` (or `pnpm codegraph:sync`) so subsequent retrieval and impact queries immediately reflect the latest AST and call graph.
     - If `.codegraph/` is missing in a fresh clone, run `pnpm codegraph:init` (`codegraph init --yes`).
     - Verify index health anytime with `codegraph status` (`pnpm codegraph:status`).

