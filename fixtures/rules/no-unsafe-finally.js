// no-unsafe-finally: every linter must report this rule here.
export function f() {
  try {
    return 1;
  } finally {
    return 2;
  }
}
