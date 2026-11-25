// no-fallthrough: every linter must report this rule here.
export function f(x) {
  let y = 0;
  switch (x) {
    case 1:
      y = 1;
    case 2:
      y = 2;
      break;
  }
  return y;
}
