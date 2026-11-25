// no-dupe-class-members: every linter must report this rule here.
export class A {
  m() {
    return 1;
  }
  m() {
    return 2;
  }
}
