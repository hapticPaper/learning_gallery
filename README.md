

[https://hapticpaper.github.io/learning_gallery]([https://hapticpaper.github.io/learning_gallery/])

Learning Gallery is a lightweight, MDX-first website for showcasing machine learning experiments: narratives, code snippets, videos (Isaac Sim or real robot clips), charts, and interactive diagrams.

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Adding content

Experiments live in `content/experiments/*.mdx`.

1. Create a new file: `content/experiments/<slug>.mdx`
2. Add required frontmatter:

```mdx
---
title: "My experiment title"
date: "2025-12-15"
summary: "One sentence summary for cards/listing"
tags:
  - robotics
  - isaacsim
---

Write markdown here...
```

3. Add richer content with MDX components:

```mdx
<Callout type="note" title="Context">
  Why this experiment exists.
</Callout>

<VideoEmbed src="https://www.youtube.com/watch?v=..." />

<SimpleLineChart
  xKey="step"
  lines={[{ key: "reward" }, { key: "loss" }]}
  data={[{ step: 0, reward: 0.1, loss: 1.2 }]}
/>
```

### Included MDX components

- `Callout` – short highlighted notes (`type`: `note` | `tip` | `warn`)
- `VideoEmbed` – YouTube links or local files (put local videos under `public/videos`)
- `SimpleLineChart` – quick inline charts via Recharts
- `FlowDiagram` – interactive React Flow diagrams (nodes/edges data)

The example experiment is in `content/experiments/isaacsim-rl-navigation.mdx`.

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```
