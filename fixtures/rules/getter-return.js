// getter-return: every linter must report this rule here.
export const o = {
  get x() {
    g();
  },
};
function g() {
  return 1;
}
