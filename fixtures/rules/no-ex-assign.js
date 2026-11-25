// no-ex-assign: every linter must report this rule here.
export function f() {
  try {
    g();
  } catch (e) {
    e = 1;
    return e;
  }
  return 0;
}
function g() {
  return 1;
}
