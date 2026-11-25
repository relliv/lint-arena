// no-case-declarations: every linter must report this rule here.
export function f(x) {
  switch (x) {
    case 1:
      let y = 2;
      return y;
  }
  return 0;
}
