# Brief shapes

## Reviewer

```
Review the change on branch {branch} against {base}.
Request: {the request or plan, one or two sentences}
Load: {the review skill}; standards: {paths from skill/standards}.
Run: {tests/validators to run}.
Return: findings only, most severe first, each with what/rule/fix; under 300 words.
```

Do not add why the change is correct, what you already checked, or the outcome you expect.

## Researcher

```
Question: {one precise question}
Feeds: {the decision it informs}
Known: {what is already settled, so it is not re-researched}
Depth: {quick check | option survey | decision-grade}
Write the brief to {path from `aif config paths.research --abs`}; write early and refine. Cite a source per claim; mark unverified items.
Return the path and a five-line summary.
```

Dispatch only after the human confirms.
