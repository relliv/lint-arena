// for-direction: every linter must report this rule here.
export function f() {
  for (let i = 0; i < 10; i--) {
    g(i);
  }
}
function g(x) {
  return x;
}
