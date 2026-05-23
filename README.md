# Roving Tabindex

Lightweight roving tabindex utility with fully focus management.

> [!NOTE]
> Focus traversal works across portals using invisible sentinels and composed-tree-aware focus detection powered by [Power Focusable](https://github.com/y14e/power-focusable).

## Install

```bash
npm i @y14e/roving-tabindex
```

```ts
// npm
import { createRovingTabIndex } from '@y14e/roving-tabindex';

// CDNs
import { createRovingTabIndex } from 'https://esm.sh/@y14e/roving-tabindex'
// or
import { createRovingTabIndex } from 'https://cdn.jsdelivr.net/npm/@y14e/roving-tabindex/+esm';
// or
import { createRovingTabIndex } from 'https://unpkg.com/@y14e/roving-tabindex/dist/index.js';
```

## 📦 APIs

### `createRovingTabIndex`

Creates a portal and preserves keyboard focus order between the original DOM and the portal.

```ts
const cleanup = createRovingTabIndex(container, options);
// => () => void
//
// container: Element
// options (optional): RovingTabIndexOptions
```

## 🪄 Options

```ts
interface RovingTabIndexOptions {
  direction?: 'horizontal' | 'vertical';
  selector?: string;
  wrap?: boolean;                        // default: false
}
```

### `wrap`

If `true`, wraps around to the first or last element when reaching the end.
