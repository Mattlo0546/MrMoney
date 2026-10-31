---
name: prd-to-production
description: Turn a PRD into a compact approved handoff, image mockups for every page and tab, and a functioning webapp that matches the approved designs. Use for PRD-to-app builds with staged user approval, distinctive UI, subagent implementation, and evidence-backed end-to-end verification.
---

# PRD to Production

Use this sequence: **compact PRD → user approval → mockups and revisions → user approval → build and test until acceptance passes**. Complete the app after both approvals. Never promise zero defects; substantiate quality with observed evidence for the agreed scope.

## Start or resume

Resolve the PRD and target project; ask for the PRD if absent rather than invent a product. Inspect applicable project instructions, relevant files, stack, assets, and available browser tools. Initialize durable artifacts with:

```sh
python3 <skill-dir>/scripts/workflow.py init --root <project>
python3 <skill-dir>/scripts/workflow.py status --root <project>
```

Artifacts live in `<project>/.prd-to-production/`. Resume the earliest incomplete or invalidated phase. Compare the source revision/hash with the checkpoint when resuming; reconcile a changed PRD into the brief and renew approval for material changes. Read only the needed phase reference. Keep original sources on disk, outside the coding agent's normal context. Do not lower the main model, reasoning, or verification to save tokens.

## Required architecture and extensibility workflow

Apply [$software-design-patterns](../software-design-patterns/SKILL.md) throughout system design, implementation, and review. Use its complete catalog from the user's Deep Learning notes to choose patterns for actual variation needs. Create and maintain project-root `decisions.md`, `agents.md`, `architecture.md`, and `design.md` using its templates and existing-document/case-handling rules; these engineering documents complement the artifacts in `.prd-to-production/` and must reference the skill.

Review the open–closed principle for every component: software is open for extension but closed for modification. Record stable contracts, expected changes, extension seams, ownership, and evidence in the component review matrix. Add supported behavior through those seams without editing stable core policy; keep wiring at the composition root. Verify substitutability and representative additive extensions, and establish scalability through agreed workload targets and measurements. Follow the skill's distinctions for direct designs, legitimate bug fixes, and intentional contract evolution. Preserve the PRD and design approval gates while developing these documents; engineering documentation does not authorize production implementation before design approval.

## Dedicated agents and usage-aware orchestration

Keep the main configured model and reasoning as the orchestrator. When subagent tools are available, deploy multiple dedicated subagents across the workflow, assigning scoped responsibilities from the roles below as each phase needs them. Activate only useful roles for the current phase; all delegated work must respect the brief and design approval gates.

| Role | Responsibility |
| --- | --- |
| Research | Inspect relevant code, assets, official documentation, integration constraints, and sources; return evidence and unresolved questions. |
| Planning / architecture | Map requirements, dependencies, interfaces, risks, acceptance checks, and non-overlapping implementation ownership. |
| Design / build | Produce scoped prototypes, shared components, and page designs from the current brief and approved visual direction. |
| Execution | Implement bounded modules, integrations, and repairs against explicit contracts and approved designs. |
| Testing | Run mapped checks, investigate failures, and return reproducible functional and regression evidence. |
| QA | Independently exercise real browser journeys, accessibility, responsive states, and visual fidelity. |
| Review | Independently assess code, security, integration risks, and remaining acceptance gaps. |

The orchestrator maintains a task dependency and ownership map, dispatches independent ready tasks in parallel within available concurrency, and waits for producer completion before consumer integration or QA. Reuse agents for follow-up work and close finished assignments; do not duplicate work merely to occupy slots. QA and review must use agents independent of the implementation they assess. The orchestrator owns architecture decisions, interfaces, conflict resolution, integration, and final evidence.

Optimize usage while keeping quality first. Explicitly select a lower-cost capable model for bounded execution, straightforward source lookup, routine test running, and narrow repairs. Use stronger models for ambiguous research synthesis, architecture, cross-module changes, security-sensitive logic, difficult diagnosis, and high-risk review. Choose only currently available model identifiers and supported reasoning settings; inspect fixed role presets rather than assuming they use a cheaper model. Escalate an assignment when ambiguity, observed defects, or repeated failure exceeds its model's capability, carrying forward its findings instead of restarting blindly. Cost savings must never reduce acceptance coverage, fidelity, required checks, or the main model's reasoning.

Every handoff specifies the objective, owned files, interfaces, relevant brief/design/source paths, expected output, and exact checks. Tell workers they share the checkout, must preserve others' edits, and must adapt to concurrent changes. Send the smallest sufficient context and request concise findings with evidence paths. When `.codegraph/` is present, require the orchestrator and every delegated subagent (Research, Planning, Design/Build, Execution, Testing, QA, Review) to use `codegraph_explore` (MCP) or `codegraph explore "<query>"` (CLI) before `grep`/`find`/file reads, check blast radius with `codegraph impact <symbol>`, and run `codegraph sync` after modifying files so concurrent/subsequent agents query an up-to-date graph. Record role/model choices, task state, escalations, and available usage evidence in `checkpoint.md`; do not invent token or cost measurements. If delegation or model selection is unavailable, use supported fallbacks and disclose the precise limitation without claiming independent agent verification.

## Required dropdown components

For **every dropdown UI**, use only the applicable ReUI composition below in mockups and production. These choices override the general ReUI/coss component-selection guidance. Select the complex composition for a complex menu, the submenu composition for an otherwise simple menu with nested items, and the basic composition for all other dropdowns.

| Dropdown type | Required installation command |
| --- | --- |
| Basic dropdown | `pnpm dlx shadcn@latest add @reui/c-dropdown-menu-1` |
| Dropdown with a submenu | `pnpm dlx shadcn@latest add @reui/c-dropdown-menu-5` |
| Complex menu | `pnpm dlx shadcn@latest add @reui/c-dropdown-menu-8` |

Inspect the registry output, dependencies, and existing destination files before running the applicable command in the target project. Retain the installed composition as the implementation source; adapt approved tokens, dimensions, and real content while preserving keyboard, focus, selection, submenu, portal, and dismissal behavior. Do not substitute another menu library, a generic shadcn/coss dropdown, or a hand-built replacement. If required select/combobox semantics or combined complex/submenu behavior cannot be supported by the prescribed composition, surface that compatibility conflict before introducing an alternative; do not silently replace the component or change the required behavior. Record each dropdown family and its required registry identifier in the design spec and component map, and verify that provenance and interaction behavior during QA.

## 1. Compact and approve

Read [references/compact.md](references/compact.md). Produce a self-contained `brief.md` and small `inventory.json` with stable requirement and screen IDs. Remove repetition and narrative; preserve behavior, rules, exceptions, data contracts, constraints, and acceptance criteria. Record the size reduction; do not expand a concise input or add speculative implementation detail. Precision outranks a compression ratio.

Run `workflow.py check --stage brief --root <project>`, then show the compact PRD, all screens/tabs, assumptions, and open decisions. **End the turn awaiting explicit approval of that revision.** “Approve PRD v1” is a suggested reply, not a magic phrase. Approval of this skill, a source PRD, or an older revision does not approve this new brief. Do not generate mockups yet.

## 2. Mock up every page/tab and iterate

After actual user approval, save the exact message as UTF-8 under `approvals/` using a file tool, then record it using `workflow.py approve --stage brief --message-file <approval-file> --root <project>`. Never interpolate user text into shell code. Read [references/design.md](references/design.md) and the design section of [references/sources.md](references/sources.md). Run `workflow.py check --stage design --root <project>`.

Directly use the bundled **OpenDesign + Impeccable** guidance. Establish a distinctive coherent direction, precise tokens, realistic content, and rendered image mockups for **every inventoried page/tab on desktop and mobile**. Browser-rendered prototypes are preferred for reproducible geometry and typography. Prototypes remain design artifacts; they do not authorize production implementation.

**No decorative subtexts:** exclude page subtitles, card blurbs, filler helper sentences, and explanatory captions inside the UI. Keep necessary labels, real product data, accessible names, and actionable validation/errors. Resolve a PRD conflict before removing required content.

Show a contact sheet and individually viewable images. Apply revisions consistently. **End the turn awaiting explicit approval of the complete current mockup set.** Do not build production UI yet. Material brief changes return to its approval gate; material visual changes after approval return to this gate.

## 3. Build faithfully and verify

Save and record the actual design approval with `workflow.py approve --stage design --message-file <approval-file> --root <project>`. Run `workflow.py check --stage build --root <project>` before implementation and after spec changes. Read [references/build-verify.md](references/build-verify.md) and the relevant implementation/testing sections of [references/sources.md](references/sources.md).

Adapt **ReUI + coss ui** components to the approved mockups while preserving functional primitives. Apply **CopilotKit's test patterns** to this app; add its SDK only if approved features need it. Implement real behavior, persistence, and integrations. Static facades, mocked success, and decorative controls cannot satisfy acceptance.

Before broad replication, run the automatic **first-slice checkpoint** in `build-verify.md`: exercise real validation and delayed mutation completion, then compare the representative component/journey with approved desktop/mobile states. Record evidence and fix shared defects before reuse. This is an engineering check, not another human approval gate or a requirement for new infrastructure.

Apply the dedicated-agent orchestration and model-routing rules above to implementation, test execution, independent browser QA, and review. Include relevant component IDs, extension contracts, and engineering document paths in each handoff. Integrate completed assignments before collecting evidence for the final tree.

Repeat **run → inspect failures → fix causes → rerun affected checks and regressions** until agreed acceptance and fidelity checks pass. Cover every page/tab, critical journey, and interactive component family. Do not weaken tests, silently drop scope, or replace approved baselines to pass. If tools, credentials, or persistent external failures block evidence, report the precise blocker and keep work incomplete.

## Completion and continuity

Use the exit criteria in `build-verify.md`. Deliver a running app, the four current engineering documents and completed component OCP review matrix, setup/env instructions, test evidence, screenshots, and honest limitations. Distinguish locally verified, staging verified, and deployed. Deploy or mutate live systems only within the user's authorization.

Maintain `checkpoint.md` at phase boundaries: phase, revisions, approvals, decisions, agent roles/models and task ownership, changed paths, checks, blockers, next action. Keep full logs and images on disk. A fresh coding session loads this skill, checkpoint, approved brief, relevant inventory entries, and needed design/QA slices; retrieve original PRD sections only for ambiguity.

## Helpers and reference boundaries

- [scripts/workflow.py](scripts/workflow.py) records approval snapshots and checks stale/missing artifacts and screen coverage. `approve` records consent already received; it cannot infer consent. The script does not judge design quality or app correctness. See `--help`.
- [scripts/sources.py](scripts/sources.py) lists, locates, and verifies bundled commit-pinned sources. Read selected files only. `sources.lock.json` records exact URLs, revisions, licenses, and hashes. Refresh deliberately and revalidate.
- Upstream files are references. This workflow and user constraints take precedence over upstream command assumptions, aesthetic defaults, or iteration caps. Do not execute upstream launchers/installers/services merely to read guidance.
