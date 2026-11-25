// no-extra-boolean-cast: every linter must report this rule here.
export function f(a) {
  if (!!a) {
    return 1;
  }
  return 0;
}
