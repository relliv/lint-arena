// no-unused-labels: every linter must report this rule here.
export function f() {
  a: {
    g();
  }
}
function g() {
  return 1;
}
