# Agent Architecture Scoping

> Created: 2026-07-28

## Answers to Scoping Questions

### 1. Primary Domain
Software development. Agents must handle: planning, writing, reviewing, correcting, testing, and documentation.
- Plans must be human-readable, reviewable, and shareable
- Future expansion: UI/UX focused agents for product/design feedback
- Model selection per agent is acceptable and preferred for quality

### 2. Deployment Target
- Local machine deployment
- Output: executable artifacts (local run)
- No DevOps / CI/CD agents needed for now
- Future: possible CI/CD pipeline, defer for now

### 3. Human-in-the-Loop
- Plans must be detailed enough for a software developer to read, understand, and give feedback on before execution
- EXTREMELY STRICT rules around security practices in generated code
- EXTREMELY STRICT rules around logging (what gets logged, how, format)
- Work log: tracked record of all agent activity for review and self-improvement

### 4. Task Complexity
- Long-horizon projects
- Broken into iterative, achievable chunks
- Robust task/progress tracking system needed
- Execution is step-by-step, not all-at-once

### 5. Agent Team vs Single Agent
- Team of specialized agents
- Each agent has a narrow role, making individual improvement cleaner over time
- Agent naming uses role-based names matching real engineering org roles:
  - `Architect`, `Tech-Lead`, `Software-Engineer`, `Principal-Engineer`, `Test-Engineer`, `Engineering-Tech-Writer`
  - Domain prefix used only when disambiguation is needed (e.g. future `Product-Tech-Writer` vs `Engineering-Tech-Writer`)

### 6. Self-Improvement Model
- Each agent builds skills specific to its core role
- No bloat — concise, focused capabilities
- Iterative growth: skills added incrementally as they are proven useful

### 7. Tech Stack
- Primary language: C#
- Cross-platform desktop: Avalonia UI
- Frameworks: .NET ecosystem preferred
- Open to Python for agent/AI tooling layer
- Not afraid of polyglot where it makes sense

### 8. Existing Codebase
- Some existing projects available for coding standards reference (naming conventions, etc.)
- Most projects will be planned from scratch
- Existing code to be used as style/standards reference, not as the base

---

## Next: Architecture Recommendation
See `agent-architecture.md`
