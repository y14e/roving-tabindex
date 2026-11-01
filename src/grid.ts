import { getActiveElement } from 'power-focusable';

function getCellCenter(cell: Element): { x: number; y: number } {
  const { left, top, width, height } = cell.getBoundingClientRect();
  return { x: left + width / 2, y: top + height / 2 };
}

export function getNextCell(cells: Element[], key: string, wrap: boolean): Element | null {
  const active = getActiveElement();

  if (!(active instanceof Element)) {
    return null;
  }

  const activeCenter = getCellCenter(active);
  let min = Infinity;
  let result: Element | null = null;

  for (const cell of cells) {
    if (cell === active) {
      continue;
    }

    const cellCenter = getCellCenter(cell);
    const distances = {
      x: Math.abs(cellCenter.x - activeCenter.x),
      y: Math.abs(cellCenter.y - activeCenter.y),
    };

    if (
      (key === 'ArrowUp' && cellCenter.y < activeCenter.y && distances.x < distances.y) ||
      (key === 'ArrowDown' && cellCenter.y > activeCenter.y && distances.x < distances.y)
    ) {
      const distance = distances.x ** 2 + distances.y ** 2;

      if (distance < min) {
        min = distance;
        result = cell;
      }
    }
  }

  if (!result && wrap) {
    let max = -Infinity;

    for (const cell of cells) {
      if (cell === active) {
        continue;
      }

      const cellCenter = getCellCenter(cell);

      if (Math.abs(cellCenter.x - activeCenter.x) < cell.getBoundingClientRect().width / 2) {
        const distance =
          key === 'ArrowUp' ? cellCenter.y - activeCenter.y : activeCenter.y - cellCenter.y;

        if (distance > max) {
          max = distance;
          result = cell;
        }
      }
    }
  }

  return result;
}

export function getSameRowCells(cells: Element[], current: Element): Element[] {
  const currentRect = current.getBoundingClientRect();
  return cells.filter((cell) => {
    const cellRect = cell.getBoundingClientRect();
    return cellRect.top < currentRect.bottom && cellRect.bottom > currentRect.top;
  });
}
