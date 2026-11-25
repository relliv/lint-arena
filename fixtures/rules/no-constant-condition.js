// no-constant-condition: every linter must report this rule here.
export function f() {
  if (true) {
    return 1;
  }
  return 0;
}
