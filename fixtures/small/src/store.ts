// A small project for smoke runs: a few files, findings of several shared rules.
export interface Item {
  id: string;
  count: number;
}

export function total(items: Item[]): number {
  var sum = 0;
  for (const item of items) {
    if (item.count == 0) continue;
    sum += item.count;
  }
  return sum;
}

export async function load(ids: string[]): Promise<Item[]> {
  const items: Item[] = [];
  for (const id of ids) {
    items.push(await fetchItem(id));
  }
  return items;
}

async function fetchItem(id: string): Promise<Item> {
  return { id, count: id.length };
}
