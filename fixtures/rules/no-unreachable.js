// no-unreachable: every linter must report this rule here.
export function f() {
  return 1;
  g();
}
function g() {
  return 2;
}
