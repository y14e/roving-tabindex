# Roving Tabindex

Lightweight roving `tabindex` utility with fully focus management. Designed for accessible menus, tabs, toolbars, and composite widgets.

## Install

```bash
npm i @y14e/roving-tabindex
```

```ts
// npm
import { createRovingTabIndex } from '@y14e/roving-tabindex';

// CDNs
import { createRovingTabIndex } from 'https://esm.sh/@y14e/roving-tabindex@3.1.4';
// or
import { createRovingTabIndex } from 'https://cdn.jsdelivr.net/npm/@y14e/roving-tabindex@3.1.4/+esm';
// or
import { createRovingTabIndex } from 'https://esm.unpkg.com/@y14e/roving-tabindex@3.1.4';
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
  direction?: 'horizontal' | 'vertical'; // default: both (undefined)
  navigationOnly?: boolean;              // default: false
  noMemory?: boolean;                    // default: false
  noStart?: boolean;                     // default: false
  selector?: string;
  typeahead?: boolean;                   // default: false
  wrap?: boolean;                        // default: false
}
```

### `navigationOnly`

If `true`, enables keyboard navigation without modifying `tabindex`. Useful for widgets like accordions where all items should remain tabbable while still supporting arrow key navigation.

### `noMemory`

If `true`, disables focus memory. Focus always starts from the first item.

### `noStart`

If `true`, does not assign `tabindex="0"` to the first item during initialization.

### `typeahead`

If `true`, enables character-based focus navigation. Typing a character moves focus to the next matching element.

### `wrap`

If `true`, wraps around to the first or last element when reaching the end.

## Demo

https://y14e.github.io/roving-tabindex/
