// no-setter-return: every linter must report this rule here.
export const o = {
  set x(v) {
    return v;
  },
};
