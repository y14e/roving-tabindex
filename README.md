# Roving Tabindex

Lightweight roving tabindex utility with fully focus management.
Designed for accessible menus, tabs, toolbars, and composite widgets.

> [!NOTE]
> Focus traversal works across shadow DOM boundaries using composed-tree-aware focus detection powered by [Power Focusable](https://github.com/y14e/power-focusable).

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

Creates a roving tabindex controller and preserves a single tabbable element within the container while enabling keyboard navigation between focusable items.

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
  direction?: 'both' | 'horizontal' | 'vertical'; // default: 'both'
  selector?: string;
  wrap?: boolean;                                 // default: false
}
```

### `wrap`

If `true`, wraps around to the first or last element when reaching the end.
