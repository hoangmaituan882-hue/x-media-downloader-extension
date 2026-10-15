// Browser regression program, executed by run-media-views.mjs.
// Sample real rendered animation frames, including Motion and native animations.
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.emulateMedia({ reducedMotion: "no-preference" });
await page.goto(fixtureUrl, { waitUntil: "networkidle" });
const advance = ms => page.evaluate(ms => new Promise(resolve => {
  const start = performance.now();
  const frame = () => performance.now() - start >= ms ? resolve() : requestAnimationFrame(frame);
  requestAnimationFrame(frame);
}), ms);
await advance(1200);
await page.getByRole("tab", { name: "\u5217\u8868", exact: true }).waitFor();
await page.mouse.move(20, 20);
const installProbe = () => {
  const { store, items } = window.mediaViewFixture;
  const root = document.querySelector("#xmd-host").shadowRoot;
  const read = index => {
    const images = Array.from(root.querySelectorAll("img")).filter(img => img.src === items[index].thumbnail);
    const image = images.at(-1);
    if (!image) return null;
    const { x, y, width, height } = image.getBoundingClientRect();
    return { x, y, width, height, count: images.length };
  };
  window.mediaViewFixture.read = read;
  window.mediaViewFixture.probe = (view, focusedAuthor = null) => {
    const source = [0, 1, 2].map(read);
    const frames = [];
    const start = performance.now();
    window.mediaViewTrace = { source, frames };
    window.mediaViewFixture.setState({ mediaView: view, focusedAuthor });
    const sample = () => {
      frames.push({ time: performance.now() - start, media: [0, 1, 2].map(read) });
      if (performance.now() - start < 800) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  };
};
await page.evaluate(installProbe);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.width - b.width, a.height - b.height);
const results = [];
const failures = [];
async function checkTransition(name, view, focusedAuthor = null) {
  await page.evaluate(({ view, focusedAuthor }) => window.mediaViewFixture.probe(view, focusedAuthor), { view, focusedAuthor });
  await advance(900);
  const trace = await page.evaluate(() => window.mediaViewTrace);
  const jumps = trace.source.map((source, index) => {
    const first = trace.frames[0]?.media[index];
    const destination = trace.frames.at(-1)?.media[index];
    assert(source && first && destination, `${name}: media ${index} disappeared`);
    const travel = distance(source, destination);
    const jump = travel < 2 ? 0 : distance(source, first) / travel;
    if (jump >= 0.55) failures.push(`${name}: media ${index} teleported (${jump.toFixed(2)})`);
    if (destination.count !== 1) failures.push(`${name}: duplicate outgoing media was not removed`);
    if (distance(trace.frames.at(-2).media[index], destination) > 1) failures.push(`${name}: layout did not settle`);
    return +jump.toFixed(3);
  });
  results.push({ name, jumps });
}

const views = ["list", "card", "tweet", "pack"];
for (const from of views) {
  for (const to of views) {
    if (from === to) continue;
    await page.evaluate(from => window.mediaViewFixture.setState({ mediaView: from, focusedAuthor: null }), from);
    await advance(900);
    await checkTransition(`${from}->${to}`, to);
  }
}

await checkTransition("pack->author", "pack", "@alice");
await checkTransition("author->pack", "pack");
await page.evaluate(() => {
  window.scrollTo(0, 500);
  const root = document.querySelector("#xmd-host").shadowRoot;
  root.querySelector(".xm-body").scrollTop = 30;
  root.querySelector(".xm-panel > div").scrollTop = 80;
});
await advance(100);
await checkTransition("scrolled-pack->list", "list");
await checkTransition("scrolled-list->card", "card");
await page.evaluate(() => {
  const host = document.querySelector("#xmd-host");
  host.dataset.theme = "dark";
  host.shadowRoot.querySelector("#xmd-root").dataset.theme = "dark";
});
await checkTransition("dark-card->tweet", "tweet");
await checkTransition("dark-tweet->pack", "pack");
for (const view of ["card", "tweet", "list", "pack", "card", "list"]) {
  await page.evaluate(view => window.mediaViewFixture.setView(view), view);
  await advance(48);
}
await advance(1200);
const settled = await page.evaluate(() => {
  const { store, items, read } = window.mediaViewFixture;
  return { view: store.getState().mediaView, selected: store.getState().items.filter(item => item.selected).length,
    expectedSelected: items.filter(item => item.selected).length, copies: read(0).count };
});
assert.equal(settled.view, "list");
assert.equal(settled.selected, settled.expectedSelected);
assert.equal(settled.copies, 1);
assert.equal(failures.length, 0, failures.join("\n"));

await page.emulateMedia({ reducedMotion: "reduce" });
await page.reload({ waitUntil: "networkidle" });
await advance(1200);
await page.evaluate(installProbe);
await page.evaluate(() => window.mediaViewFixture.probe("pack"));
await advance(900);
const reduced = await page.evaluate(() => window.mediaViewTrace);
for (let index = 0; index < 3; index++) {
  const firstPaint = reduced.frames.find(frame => frame.time >= 64);
  assert(distance(firstPaint.media[index], reduced.frames.at(-1).media[index]) < 1,
    "Reduced motion should switch media immediately");
}

await page.emulateMedia({ reducedMotion: "no-preference" });
await page.reload({ waitUntil: "networkidle" });
await advance(1200);
await page.evaluate(installProbe);
await page.evaluate(() => {
  window.scrollTo(0, 0);
  window.mediaViewFixture.setState({ mediaView: "card" });
  const root = document.querySelector("#xmd-host").shadowRoot;
  root.querySelector(".xm-body").scrollTop = 0;
  root.querySelector(".xm-panel > div").scrollTop = 0;
});
await advance(900);
await page.locator("#xmd-host .xm-panel img").first().hover();
await page.locator("#xmd-host .xhd-preview").waitFor({ state: "visible" });
await page.locator("#xmd-host .xhd-backdrop").click({ position: { x: 5, y: 5 } });
await page.locator("#xmd-host .xhd-preview").waitFor({ state: "detached" });
assert.equal(await page.evaluate(() => window.mediaViewFixture.read(0).count), 1);
assert.deepEqual(errors, []);
assert.equal(failures.length, 0, failures.join("\n"));
return { passed: results.length + 3, results, rapidSwitch: settled, reducedMotion: true, hoverPreview: true };
