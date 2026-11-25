// no-self-assign: every linter must report this rule here.
export function f(a) {
  a = a;
  return a;
}
