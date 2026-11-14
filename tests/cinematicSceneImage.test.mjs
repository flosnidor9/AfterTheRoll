import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function imageHarness() {
  const hooks = [];
  let cursor = 0;
  const testModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/components/trpg/CinematicSceneImage.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports,
    require(name) {
      if (name === 'react') return {
        // Deliberately rerender even if memo would skip it, to exercise the refs.
        memo: component => component,
        useCallback(fn, deps) {
          const i = cursor++;
          if (!hooks[i] || deps.some((dep, j) => dep !== hooks[i].deps[j])) hooks[i] = { fn, deps };
          return hooks[i].fn;
        },
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === 'next/image') return { __esModule: true, default: 'Image' };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return props => { cursor = 0; return testModule.exports.default(props).props; };
}

for (const extension of ['gif', 'apng']) {
  test(`${extension} retains the Next Image ref handlers across unrelated scene renders`, () => {
    const render = imageHarness();
    const loaded = [], failed = [], ratios = [];
    const props = {
      src: `https://example.test/once.${extension}`, alt: 'Scene', className: 'object-fill',
      onLoaded: source => loaded.push(source), onFailed: source => failed.push(source),
      onRatio: (source, ratio) => ratios.push([source, ratio]),
    };
    const first = render(props);
    // Another scene image loading or changing rebuilds the scene's image JSX.
    for (let i = 0; i < 3; i++) {
      const next = render({ ...props });
      assert.equal(next.src, first.src);
      assert.equal(next.onError, first.onError, 'Changing onError makes Next Image reassign img.src and restart animation');
      assert.equal(next.onLoad, first.onLoad);
    }
    const replacement = render({ ...props, src: 'https://example.test/replacement.png' });
    replacement.onLoad({ currentTarget: { naturalWidth: 100, naturalHeight: 200 } });
    replacement.onError();
    assert.deepEqual(loaded, [replacement.src]);
    assert.deepEqual(failed, [replacement.src]);
    assert.deepEqual(ratios, [[replacement.src, 2]]);
  });
}
