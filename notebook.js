import hljs from 'highlight.js/lib/core';
import rust from 'highlight.js/lib/languages/rust';
import MarkdownIt from 'markdown-it';
import { table } from 'table';
import { AnsiUp } from 'ansi_up';
import { sanitize } from 'dompurify';
import { basicSetup, EditorView } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import json from './json';
import 'highlight.js/styles/default.css';
import './notebook.css';

const logs = [];
const tableConfig = {
  border: {
    topBody: `─`,
    topJoin: `┬`,
    topLeft: `┌`,
    topRight: `┐`,

    bottomBody: `─`,
    bottomJoin: `┴`,
    bottomLeft: `└`,
    bottomRight: `┘`,

    bodyLeft: `│`,
    bodyRight: `│`,
    bodyJoin: `│`,

    joinBody: `─`,
    joinLeft: `├`,
    joinRight: `┤`,
    joinJoin: `┼`
  }
};

// processing code
const importReg = /import\s+(?:\*\s+as\s*)?(.*?)\s+from\s*(["'])([@\w\s\\/.-]*?)\2/g;
const runCodes = [];
let promptNumber = 0;

// Then register the languages you need
hljs.registerLanguage('rust', rust);

const md = new MarkdownIt({
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (ex) {
        originalLog(ex);
      }
    }

    return ''; // use external default escaping
  }
});

const ansi_up = new AnsiUp();
const VERSION = '0.7.0';

const doc = window.document;

// Helper functions
const ident = function (x) {
  return x;
};

const makeElement = function (tag, classNames) {
  const el = doc.createElement(tag);
  el.className = (classNames || [])
    .map(function (cn) {
      return nb.prefix + cn;
    })
    .join(' ');
  return el;
};

const escapeHTML = function (raw) {
  const replaced = raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return replaced;
};

const joinText = function (text) {
  if (text.join) {
    return text.map(joinText).join('');
  } else {
    return text;
  }
};

// Set up `nb` namespace
const nb = {
  prefix: 'nb-',
  markdown: md.render.bind(md) || ident,
  ansi: ansi_up.ansi_to_html.bind(ansi_up) || ident,
  sanitizer: sanitize || ident,
  executeJavaScript: true,
  highlighter: ident,
  VERSION: VERSION
};

const frameEl = document.createElement('iframe');
frameEl.style.display = 'none';
document.body.appendChild(frameEl);
nb.sandboxFrame = frameEl.contentWindow;
nb.sandboxFrame.depedencies = {};
console.log = nb.sandboxFrame.console.log = function (...value) {
  logs.push(...value.map(json));
};

console.table = nb.sandboxFrame.console.table = function (data) {
  if (!Array.isArray(data) || !data.length) return;
  const head = Object.keys(data[0]);
  const rows = [head];
  for (const item of data) {
    rows.push(head.map((name) => item[name]));
  }
  logs.push(table(rows, tableConfig));
};

nb.sandboxFrame.require = (dep) => {
  console.warn(dep, nb.depedencies);
  nb.sandboxFrame.depedencies[dep];
};

nb.updateDepedencies = function (depedencies) {
  Object.assign(nb.sandboxFrame.depedencies, depedencies);
};

// Inputs
nb.Input = function (raw, cell) {
  this.raw = raw;
  this.cell = cell;
};

nb.Input.prototype.render = function () {
  if (!this.raw.length) {
    return makeElement('div');
  }
  const holder = makeElement('div', ['input']);
  const cell = this.cell;
  if (typeof cell.number === 'number') {
    holder.setAttribute('data-prompt-number', this.cell.number);
    if (this.cell.number > promptNumber) {
      promptNumber = this.cell.number;
    }
  }
  const preEl = makeElement('pre');
  const codeEl = makeElement('code');
  const notebook = cell.worksheet.notebook;
  const m = notebook.metadata;
  const lang = this.cell.raw.language || m.language || (m.kernelspec && m.kernelspec.language) || (m.language_info && m.language_info.name);
  codeEl.setAttribute('data-language', lang);
  preEl.className = 'language-' + lang;
  codeEl.className = 'language-' + lang;

  const editor = new EditorView({
    doc: joinText(this.raw),
    extensions: [basicSetup, javascript({ typescript: true })],
    parent: codeEl
  });
  preEl.appendChild(codeEl);

  const runEl = makeElement('button');
  runEl.className = 'run-cell';
  runEl.innerHTML = ' ❯ ';
  const handler = async () => {
    const code = editor.state.doc.toString().replace(importReg, (m0, m1, m2, m3) => `const ${m1.replaceAll(' as ', ':')} = window.depedencies['${m3}']`);
    const outputEl = holder.nextSibling;
    const stdoutEl = outputEl.lastElementChild;
    runEl.innerHTML = '';
    runEl.classList.add('loading');
    const start = performance.now();
    try {
      const result = await (1, nb.sandboxFrame.eval)(`(async () => {\n${code}\n})()`);
      const logStr = logs.map((log) => '<span style="width:100%;display:inline-block">' + log + '</span>').join('');
      stdoutEl.className = 'nb-stdout';
      stdoutEl.innerHTML = logStr;
      if (result !== undefined) {
        stdoutEl.innerHTML += json(result);
      }
      runEl.innerHTML = '&check;';
    } catch (ex) {
      runEl.innerHTML = 'x';
      stdoutEl.className = 'nb-stderr';
      stdoutEl.innerHTML = json(ex.message);
    } finally {
      runEl.classList.remove('loading');
      promptNumber++;
      holder.setAttribute('data-prompt-number', promptNumber);
      outputEl.setAttribute('data-prompt-number', promptNumber);
      logs.length = 0;
      stdoutEl.innerHTML += json(`${stdoutEl.innerHTML.length ? '\n' : ''}Took ${Number((performance.now() - start).toFixed(2))} ms`);
    }
  };
  runCodes.push(handler);
  runEl.onclick = handler;

  holder.appendChild(runEl);

  holder.appendChild(preEl);
  this.el = holder;
  return holder;
};

// Outputs and output-renderers
const imageCreator = function (format) {
  return function (data) {
    const el = makeElement('img', ['image-output']);
    el.src = 'data:image/' + format + ';base64,' + joinText(data).replace(/\n/g, '');
    return el;
  };
};

nb.display = {};
nb.display.text = function (text) {
  const el = makeElement('pre', ['text-output']);
  el.innerHTML = nb.highlighter(nb.ansi(joinText(text)), el);
  return el;
};
nb.display['text/plain'] = nb.display.text;

nb.display.html = function (html) {
  const el = makeElement('div', ['html-output']);
  el.innerHTML = nb.sanitizer(joinText(html));
  return el;
};
nb.display['text/html'] = nb.display.html;

nb.display.marked = function (md) {
  return nb.display.html(nb.markdown(joinText(md)));
};
nb.display['text/markdown'] = nb.display.marked;

nb.display.svg = function (svg) {
  const el = makeElement('div', ['svg-output']);
  el.innerHTML = joinText(svg);
  return el;
};
nb.display['text/svg+xml'] = nb.display.svg;
nb.display['image/svg+xml'] = nb.display.svg;

nb.display.latex = function (latex) {
  const el = makeElement('div', ['latex-output']);
  el.innerHTML = joinText(latex);
  return el;
};
nb.display['text/latex'] = nb.display.latex;

nb.display.javascript = function (js) {
  if (nb.executeJavaScript) {
    const el = makeElement('script');
    el.innerHTML = joinText(js);
    return el;
  } else {
    const el = document.createElement('pre');
    el.innerText = 'JavaScript execution is disabled for this notebook';
    return el;
  }
};
nb.display['application/javascript'] = nb.display.javascript;

nb.display.png = imageCreator('png');
nb.display['image/png'] = nb.display.png;
nb.display.jpeg = imageCreator('jpeg');
nb.display['image/jpeg'] = nb.display.jpeg;

nb.display_priority = ['png', 'image/png', 'jpeg', 'image/jpeg', 'svg', 'image/svg+xml', 'text/svg+xml', 'html', 'text/html', 'text/markdown', 'latex', 'text/latex', 'javascript', 'application/javascript', 'text', 'text/plain'];

const render_display_data = function () {
  const o = this;
  const formats = nb.display_priority.filter(function (d) {
    return o.raw.data ? o.raw.data[d] : o.raw[d];
  });
  const format = formats[0];
  if (format) {
    if (nb.display[format]) {
      return nb.display[format](o.raw[format] || o.raw.data[format]);
    }
  }
  return makeElement('div', ['empty-output']);
};

const render_error = function () {
  const el = makeElement('pre', ['pyerr']);
  const raw = this.raw.traceback.join('\n');
  el.innerHTML = nb.highlighter(nb.ansi(escapeHTML(raw)), el);
  return el;
};

nb.Output = function (raw, cell) {
  this.raw = raw;
  this.cell = cell;
  this.type = raw.output_type;
};

nb.Output.prototype.renderers = {
  display_data: render_display_data,
  execute_result: render_display_data,
  pyout: render_display_data,
  pyerr: render_error,
  error: render_error,
  stream: function () {
    const el = makeElement('pre', [this.raw.stream || this.raw.name]);
    const raw = joinText(this.raw.text);
    el.innerHTML = nb.highlighter(nb.ansi(escapeHTML(raw)), el);
    return el;
  }
};

nb.Output.prototype.render = function () {
  const outer = makeElement('div', ['output']);
  if (typeof this.cell.number === 'number') {
    outer.setAttribute('data-prompt-number', this.cell.number);
  }
  const inner = this.renderers[this.type].call(this);
  outer.appendChild(inner);
  this.el = outer;
  return outer;
};

// Post-processing
nb.coalesceStreams = function (outputs) {
  if (!outputs.length) {
    return outputs;
  }
  const last = outputs[0];
  const new_outputs = [last];
  outputs.slice(1).forEach(function (o) {
    if (o.raw.output_type === 'stream' && last.raw.output_type === 'stream' && o.raw.stream === last.raw.stream && o.raw.name === last.raw.name) {
      last.raw.text = last.raw.text.concat(o.raw.text);
    } else {
      new_outputs.push(o);
      last = o;
    }
  });
  return new_outputs;
};

// Cells
nb.Cell = function (raw, worksheet) {
  const cell = this;
  cell.raw = raw;
  cell.worksheet = worksheet;
  cell.type = raw.cell_type;
  if (cell.type === 'code') {
    cell.number = raw.prompt_number > -1 ? raw.prompt_number : raw.execution_count;
    const source = raw.input || [raw.source];
    cell.input = new nb.Input(source, cell);
    if (cell.raw.outputs.length === 0) {
      cell.raw.outputs.push({ name: 'stdout', output_type: 'stream', text: '' });
    }
    const raw_outputs = cell.raw.outputs.map(function (o) {
      return new nb.Output(o, cell);
    });
    cell.outputs = nb.coalesceStreams(raw_outputs);
  }
};

nb.Cell.prototype.renderers = {
  markdown: function () {
    const el = makeElement('div', ['cell', 'markdown-cell']);

    const joined = joinText(this.raw.source);

    el.innerHTML = nb.sanitizer(nb.markdown(joined));

    return el;
  },
  heading: function () {
    const el = makeElement('h' + this.raw.level, ['cell', 'heading-cell']);
    el.innerHTML = nb.sanitizer(joinText(this.raw.source));
    return el;
  },
  raw: function () {
    const el = makeElement('div', ['cell', 'raw-cell']);
    el.innerHTML = escapeHTML(joinText(this.raw.source));
    return el;
  },
  code: function () {
    const cell_el = makeElement('div', ['cell', 'code-cell']);
    cell_el.appendChild(this.input.render());
    this.outputs.forEach(function (o) {
      cell_el.appendChild(o.render());
    });
    return cell_el;
  }
};

nb.Cell.prototype.render = function () {
  const el = this.renderers[this.type].call(this);
  this.el = el;
  return el;
};

// Worksheets
nb.Worksheet = function (raw, notebook) {
  const worksheet = this;
  this.raw = raw;
  this.notebook = notebook;
  this.cells = raw.cells.map(function (c) {
    return new nb.Cell(c, worksheet);
  });
  this.render = function () {
    const worksheet_el = makeElement('div', ['worksheet']);
    worksheet.cells.forEach(function (c) {
      worksheet_el.appendChild(c.render());
    });
    this.el = worksheet_el;
    return worksheet_el;
  };
};

// Notebooks
nb.Notebook = function (raw, config) {
  const notebook = this;
  this.raw = raw;
  this.config = config;
  const meta = (this.metadata = raw.metadata || {});
  this.title = meta.title || meta.name;
  const _worksheets = raw.worksheets || [{ cells: raw.cells }];
  this.worksheets = _worksheets.map(function (ws) {
    return new nb.Worksheet(ws, notebook);
  });
  this.sheet = this.worksheets[0];
};

nb.Notebook.prototype.render = function () {
  const notebook_el = makeElement('div', ['notebook']);

  this.worksheets.forEach(function (w) {
    notebook_el.appendChild(w.render());
  });
  this.el = notebook_el;
  return notebook_el;
};

nb.parse = function (nbjson, config) {
  return new nb.Notebook(nbjson, config);
};

nb.runAll = async function () {
  for (const run of runCodes) {
    await run();
  }
};

nb.fetch = async function (value) {
  runCodes.length = 0;
  const json = await fetch(`/nb/${value}.ipynb`).then((res) => res.json());
  const notebook = nb.parse(json);
  return notebook;
};

export default nb;
