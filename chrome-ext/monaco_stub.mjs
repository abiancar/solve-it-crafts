// Lightweight no-op modern-monaco stub generated from nbs/05_chrome_ext.ipynb
const noop = () => {};
const disp = () => ({ dispose: noop });
const makeProxy = base => new Proxy(base, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'symbol') return undefined;
    return k.startsWith('onDid') || k.startsWith('onWill') || k.startsWith('register') ? disp : noop;
  }
});

class Uri {
  constructor(s = '') { this._s = String(s); }
  toString() { return this._s; }
  static parse(s) { return new Uri(s); }
  static file(s) { return new Uri('file://' + s); }
}

class Position {
  constructor(lineNumber = 1, column = 1) { this.lineNumber = lineNumber; this.column = column; }
}

class Range {
  constructor(sl = 1, sc = 1, el = 1, ec = 1) {
    this.startLineNumber = sl; this.startColumn = sc;
    this.endLineNumber = el; this.endColumn = ec;
  }
}

const makeModel = (val = '', lang = 'plaintext', uri = null) => {
  let _val = String(val ?? ''), _lang = lang;
  const _uri = uri || Uri.parse('inmemory://craft-stub');
  return makeProxy({
    __craftStub: true,
    uri: _uri,
    getValue: () => _val,
    setValue: v => { _val = String(v ?? ''); },
    getLanguageId: () => _lang,
    setLanguage: l => { _lang = l; },
    getLineCount: () => _val ? _val.split('\n').length : 1,
    getFullModelRange: () => new Range(1, 1, 1, 1),
    pushEditOperations: () => null,
    isDisposed: () => false,
    dispose: noop,
  });
};

const makeEditor = () => {
  let _model = null;
  const _node = typeof document !== 'undefined' ? document.createElement('div') : null;
  return makeProxy({
    __craftStub: true,
    getContainerDomNode: () => _node,
    getDomNode: () => _node,
    getModel: () => _model,
    setModel: m => { _model = m; },
    getValue: () => _model?.getValue?.() || '',
    setValue: v => { _model?.setValue?.(v); },
    getPosition: () => new Position(1, 1),
    getSelection: () => new Range(1, 1, 1, 1),
    getRawOptions: () => ({}),
    getOption: () => undefined,
    hasTextFocus: () => false,
    hasWidgetFocus: () => false,
    layout: noop,
    focus: noop,
    updateOptions: noop,
    trigger: noop,
    dispose: noop,
  });
};

export const editor = makeProxy({
  __craftStub: true,
  create: () => makeEditor(),
  createDiffEditor: () => makeEditor(),
  createModel: (val, lang, uri) => makeModel(val, lang, uri),
  getModel: () => null,
  getEditors: () => [],
  getDiffEditors: () => [],
  getModels: () => [],
  setModelLanguage: (m, l) => m?.setLanguage?.(l),
  setTheme: noop,
  defineTheme: noop,
  remeasureFonts: noop,
  addKeybindingRule: disp,
  registerLinkOpener: disp,
  registerEditorOpener: disp,
});

export const languages = makeProxy({
  __craftStub: true,
  getLanguages: () => [],
  onLanguage: disp,
});

export const KeyMod = { CtrlCmd: 2048, Shift: 1024, Alt: 512, WinCtrl: 256 };
export const KeyCode = new Proxy({}, { get: (_, k) => (typeof k === 'symbol' ? undefined : 0) });
export { Uri, Range, Position };

export const monaco = { __craftStub: true, editor, languages, Uri, Range, Position, KeyMod, KeyCode };
globalThis.monaco = monaco;

export async function init() { return monaco; }
export default monaco;
