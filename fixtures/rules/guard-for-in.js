// guard-for-in: every linter must report this rule here.
export function f(o) {
  for (const k in o) {
    g(k);
  }
}
function g(x) {
  return x;
}
