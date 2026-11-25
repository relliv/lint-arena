// no-async-promise-executor: every linter must report this rule here.
export const p = new Promise(async resolve => {
  resolve(1);
});
