# Review Report: {Subject Reference}

## Metadata

| Field       | Value                                       |
| ----------- | ------------------------------------------- |
| Reviewed By | {Reviewer Agent}                            |
| Date        | {YYYY-MM-DD HH:mm}                          |
| Subject     | {Plan ID / ADR / diff reference}            |
| Iteration   | {n — 1 for a first review}                  |
| Outcome     | APPROVED / NEEDS_CHANGES                    |
| Findings    | {n} CRITICAL, {n} HIGH, {n} MEDIUM, {n} LOW |

---

## Coverage

| Dimension   | Status                | Findings            |
| ----------- | --------------------- | ------------------- |
| {Dimension} | Pass / Findings / N/A | {Finding IDs, or —} |

---

## Acceptance Criteria

<!-- Include only when the governing plan enumerates acceptance criteria; omit this whole section otherwise. -->

| #   | Criterion        | Status      |
| --- | ---------------- | ----------- |
| {n} | {Criterion text} | Met / Unmet |

---

## Prior Findings

<!-- Include only on a re-review (Iteration > 1); omit this whole section on a first review. -->

| Prior ID       | Title   | Status                              |
| -------------- | ------- | ----------------------------------- |
| {Severity-{n}} | {Title} | Resolved / Not resolved / Regressed |

---

## Findings

### [{Severity}-{n}] {Short Title}

- **Category**: {Coverage dimension(s) this finding falls under, comma-separated}
- **File**: `{path/to/file}` (line {n})
- **Violation**: {Which plan requirement, standard, or schema rule is violated}
- **Finding**: {What is wrong}
- **Required action**: {What must be done to resolve it}

---

## LOW Backlog

<!-- LOW findings only; fixed only if the human asks. Omit this whole section when there are none. -->

### [LOW-{n}] {Short Title}

- **Category**: {Coverage dimension(s)}
- **File**: `{path/to/file}` (line {n})
- **Violation**: {Which requirement, standard, or schema rule is violated}
- **Finding**: {What is wrong}
- **Required action**: {What would resolve it, if the human asks}

---

## Summary

{One paragraph: overall assessment, what was done well, what must change.}
