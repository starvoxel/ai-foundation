---
section: '00'
title: 'Section title'
lifecycle: draft # draft | published — completion, not currency
last_verified: 0000000 # commit SHA the key_files claim was last checked against
tags: []
key_files:
  - path/to/file.js
---

> One-sentence summary of what this section covers.

Body content goes here, following arc42's section structure for this number.

## Notes on this template

- `section` is the arc42 section number as a zero-padded string (`"01"`, `"05"`), or
  a white-box sub-section (`"05.01"`) for a §5 building-block expansion.
- `lifecycle` is the only currency-adjacent value an author ever sets by hand — is
  the doc still being written (`draft`) or done (`published`)? Never write
  `current`/`stale` here; `aif index` computes a separate `stale` flag from
  `last_verified` vs. each `key_files` entry's current state.
- `key_files` lists only files whose _logic_ changing would make this doc's claims
  wrong — not callers/consumers, not tests, not incidentally-touched config. Past 5
  entries, treat each new addition as a prompt to re-evaluate whether this section
  should split into a finer `NN.MM` subsection — not a hard cap, a standing check.
- Delete this file's own frontmatter/notes when copying it for a new section — they're
  template scaffolding, not content.
