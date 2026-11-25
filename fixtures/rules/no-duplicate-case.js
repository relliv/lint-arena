// no-duplicate-case: every linter must report this rule here.
export function f(x) {
  switch (x) {
    case 1:
      return 1;
    case 1:
      return 2;
  }
  return 0;
}
