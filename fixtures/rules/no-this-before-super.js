// no-this-before-super: every linter must report this rule here.
export class A extends Object {
  constructor() {
    this.a = 1;
    super();
  }
}
