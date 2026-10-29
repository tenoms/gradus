import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

// Exercise the component's actual navigation effect without introducing a DOM
// renderer: the hook runner preserves React's dependency comparison semantics.
const source = await readFile(new URL("../src/pages/MathWorkspace.tsx", import.meta.url), "utf8");
const effect = source.match(/useEffect\(\(\) => \{\n    if \(!current\) return;\n    const currentIndex[\s\S]+?\n  \}, \[[^\]]+\]\);/)?.[0];
assert.ok(effect, "BookWorkspace keeps its selected-question navigation effect");

function navigation() {
  let previousDependencies;
  let page = 1;
  const scope = {
    current: undefined,
    currentQuestionId: undefined,
    shown: [],
    catalog: { data: undefined },
    catalogPagination: { pageSize: 30, setPage: value => { page = value; } },
    mathQuestionId: row => row.QuestionID,
    useEffect(callback, dependencies) {
      if (!previousDependencies || dependencies.some((value, index) => !Object.is(value, previousDependencies[index]))) callback();
      previousDependencies = dependencies;
    },
  };
  const render = () => {
    scope.currentQuestionId = scope.current?.QuestionID;
    runInNewContext(effect, scope);
  };
  return { scope, render, page: () => page, choosePage: value => { page = value; } };
}
const questions = Array.from({ length: 75 }, (_, index) => ({ QuestionID: index + 1 }));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

for (const first of ["catalogue", "resume"]) {
  test(`resuming question 61 reveals its page when ${first} arrives first and preserves manual browsing`, async () => {
    const view = navigation();
    const catalogue = deferred(), resume = deferred();
    const loadedCatalogue = catalogue.promise.then(rows => {
      view.scope.catalog.data = rows;
      view.scope.shown = rows;
      view.render();
    });
    const loadedResume = resume.promise.then(row => {
      view.scope.current = row;
      view.render();
    });
    view.render();
    if (first === "catalogue") {
      catalogue.resolve(questions);
      await loadedCatalogue;
      assert.equal(view.page(), 1);
      resume.resolve(questions[60]);
    } else {
      resume.resolve(questions[60]);
      await loadedResume;
      assert.equal(view.page(), 1);
      catalogue.resolve(questions);
    }
    await Promise.all([loadedCatalogue, loadedResume]);
    assert.equal(view.page(), 3, "the resumed question is visible in the catalogue");
    view.choosePage(1);
    view.render();
    assert.equal(view.page(), 1, "a rerender does not override manually chosen pages");
    view.scope.catalogPagination.pageSize = 15;
    view.render();
    assert.equal(view.page(), 5, "changing page size reveals the selected question again");
  });
}
