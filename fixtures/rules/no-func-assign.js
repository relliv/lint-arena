// no-func-assign: every linter must report this rule here.
function g() {
  return 1;
}
g = 2;
export { g };
