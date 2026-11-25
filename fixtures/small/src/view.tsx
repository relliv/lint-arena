// JSX goes through every linter's parser too.
import { total, type Item } from './store.ts';

export function Summary({ items }: { items: Item[] }) {
  let label = `Total: ${total(items)}`;
  return <p className="summary">{label}</p>;
}
