// no-const-assign: every linter must report this rule here.
export function f() {
  const a = 1;
  a = 2;
  return a;
}
