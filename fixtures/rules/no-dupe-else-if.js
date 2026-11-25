// no-dupe-else-if: every linter must report this rule here.
export function f(a) {
  if (a === 1) {
    return 1;
  } else if (a === 1) {
    return 2;
  }
  return 0;
}
