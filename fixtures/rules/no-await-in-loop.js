// no-await-in-loop: every linter must report this rule here.
export async function f(xs) {
  for (const x of xs) {
    await g(x);
  }
}
async function g(x) {
  return x;
}
