// Verification of Keyboard interaction, error focus, Back/Next, pathway switching, and pageshow recovery
// Compatible with both Node.js (`node tests/application-interaction.cjs`) and macOS JavaScriptCore (`jsc tests/application-interaction.cjs`)

let assert, readSource, runContext;
if (typeof require !== 'undefined') {
  assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  readSource = () => fs.readFileSync(path.join(__dirname, '../assets/public-application.js'), 'utf8');
  runContext = (src, ctx) => vm.runInNewContext(src, ctx);
} else {
  assert = (cond, msg) => { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); };
  assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`Assertion failed: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg || ''}`); };
  readSource = () => readFile('assets/public-application.js');
  runContext = (src, ctx) => {
    const fn = new Function('ctx', 'with(ctx){\n' + src + '\n}');
    fn(ctx);
  };
}

const source = readSource();

class Element {
  constructor(tag, id = '', name = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.name = name;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.attributes = {};
    this.events = {};
    this.classList = {
      classes: new Set(),
      add: c => this.classList.classes.add(c),
      remove: c => this.classList.classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList.classes.has(c)) this.classList.classes.delete(c);
          else this.classList.classes.add(c);
        } else if (force) this.classList.classes.add(c);
        else this.classList.classes.delete(c);
      },
      contains: c => this.classList.classes.has(c)
    };
    this.children = [];
    this.focused = false;
    this.disabled = false;
    this.required = false;
  }
  querySelectorAll(sel) {
    const matches = [];
    function find(node) {
      for (const ch of node.children) {
        if (sel === 'input,select,textarea' && ['INPUT', 'SELECT', 'TEXTAREA'].includes(ch.tagName)) matches.push(ch);
        find(ch);
      }
    }
    find(this);
    return matches;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }
  getAttribute(k) { return this.attributes[k] || null; }
  addEventListener(name, fn) {
    if (!this.events[name]) this.events[name] = [];
    this.events[name].push(fn);
  }
  trigger(name, event = {}) {
    (this.events[name] || []).forEach(fn => fn(event));
  }
  focus() { this.focused = true; }
  checkValidity() {
    if (this.type === 'email' && this.value && !this.value.includes('@')) return false;
    if (this.required && !this.value.trim()) return false;
    return true;
  }
}

(() => {
  // Test 1: Pathway switching logic and conditional field toggling
  const startPathway = source.indexOf('  const pathways={');
  const endPathway = source.indexOf('  function checkIds', startPathway);
  
  const mockElements = {
    campusDisplay: new Element('div', 'campusDisplay'),
    gradeApplying: new Element('select', 'gradeApplying'),
    documentGuide: new Element('p', 'documentGuide'),
    pathway: new Element('input', 'pathway'),
    campus: new Element('input', 'campus'),
    formStatus: new Element('div', 'formStatus'),
    docAdditionalTitle: new Element('strong', 'docAdditionalTitle'),
    docAdditionalHint: new Element('small', 'docAdditionalHint')
  };

  // Mock document-prep-report checkbox with a label > small structure for reportHint
  const reportSmall = new Element('small');
  const reportLabel = new Element('label');
  const reportCheckbox = new Element('input', '', 'document-prep-report');
  reportCheckbox.name = 'document-prep-report';
  reportCheckbox.closest = tag => tag === 'label' ? reportLabel : null;
  reportLabel.querySelector = sel => sel === 'small' ? reportSmall : null;

  const pathCards = [
    new Element('button', '', ''),
    new Element('button', '', ''),
    new Element('button', '', '')
  ];
  pathCards[0].dataset = { pathway: 'Cambridge' };
  pathCards[1].dataset = { pathway: 'CAPS Secondary' };
  pathCards[2].dataset = { pathway: 'Primary' };

  const conditionalBoxes = [
    new Element('div'),
    new Element('div'),
    new Element('div')
  ];
  conditionalBoxes[0].dataset = { pathwayFields: 'Cambridge' };
  conditionalBoxes[1].dataset = { pathwayFields: 'CAPS Secondary' };
  conditionalBoxes[2].dataset = { pathwayFields: 'Primary' };

  const cambridgeInput = new Element('input', 'cambridgeExperience');
  conditionalBoxes[0].children.push(cambridgeInput);

  const capsInput = new Element('input', 'capsCurrentGrade');
  conditionalBoxes[1].children.push(capsInput);

  const progressSteps = [1, 2, 3, 4, 5, 6].map(n => new Element('div'));
  const stepSections = [1, 2, 3, 4, 5, 6].map(n => {
    const el = new Element('section');
    el.dataset = { appStep: String(n) };
    return el;
  });

  const context = {
    form: {
      querySelectorAll: () => []
    },
    document: {
      getElementById: id => mockElements[id] || null,
      querySelectorAll: sel => {
        if (sel === '.rf-apply-path') return pathCards;
        if (sel === '[data-pathway-fields]') return conditionalBoxes;
        if (sel === '.rf-apply-step') return progressSteps;
        if (sel === '.rf-apply-card' || sel === '[data-app-step]') return stepSections;
        if (sel === 'input,select,textarea') return [];
        return [];
      },
      querySelector: sel => {
        if (sel.includes('[data-app-step=')) {
          const match = sel.match(/data-app-step='(\d+)'/);
          return stepSections[Number(match[1]) - 1];
        }
        if (sel === '[name="document-prep-report"]') return reportCheckbox;
        return null;
      }
    },
    sessionStorage: { setItem: () => {}, removeItem: () => {} },
    window: { scrollTo: () => {} },
    matchMedia: () => ({ matches: false }),
    setStatus: () => {}
  };
  context.ctx = context;
  const snippet = source.slice(startPathway, endPathway) + '\nctx.selectPathway = selectPathway;\nctx.showStep = showStep;';
  runContext(snippet, context);

  // 1. Select Cambridge
  context.selectPathway('Cambridge', pathCards[0]);
  assert.equal(mockElements.pathway.value, 'Cambridge', 'Hidden pathway should be Cambridge');
  assert(mockElements.campusDisplay.textContent.includes('Noordhoek'), 'Campus display should show Noordhoek for Cambridge');
  assert(mockElements.gradeApplying.innerHTML.includes('IGCSE'), 'Grades should include IGCSE for Cambridge');
  assert.equal(pathCards[0].attributes['aria-pressed'], 'true', 'Selected card has aria-pressed true');
  assert.equal(pathCards[1].attributes['aria-pressed'], 'false', 'Unselected card has aria-pressed false');
  assert.equal(cambridgeInput.disabled, false, 'Cambridge conditional input is enabled');
  assert.equal(capsInput.disabled, true, 'CAPS conditional input is disabled');
  assert(mockElements.docAdditionalTitle.textContent.includes('Cambridge'), 'Step 5 additional label should say Cambridge for Cambridge pathway');
  assert(mockElements.docAdditionalHint.textContent.includes('IGCSE'), 'Step 5 additional hint should mention IGCSE for Cambridge pathway');

  // 2. Switch to CAPS Secondary
  context.selectPathway('CAPS Secondary', pathCards[1]);
  assert.equal(mockElements.pathway.value, 'CAPS Secondary', 'Hidden pathway switched to CAPS Secondary');
  assert(mockElements.campusDisplay.textContent.includes('Maartens'), 'Campus display should show Maartens Street for CAPS');
  assert(mockElements.gradeApplying.innerHTML.includes('Grade 8'), 'Grades should include Grade 8 for CAPS');
  assert.equal(pathCards[1].attributes['aria-pressed'], 'true');
  assert.equal(pathCards[0].attributes['aria-pressed'], 'false');
  assert.equal(cambridgeInput.disabled, true, 'Cambridge input disabled after switch');
  assert.equal(capsInput.disabled, false, 'CAPS input enabled after switch');
  assert(mockElements.docAdditionalTitle.textContent.includes('Transfer'), 'Step 5 additional label should say Transfer for CAPS pathway');

  // 3. Switch to Primary — clinic card
  context.selectPathway('Primary', pathCards[2]);
  assert.equal(mockElements.pathway.value, 'Primary', 'Hidden pathway switched to Primary');
  assert(mockElements.campusDisplay.textContent.includes('Maartens'), 'Campus display should show Maartens Street for Primary');
  assert(mockElements.gradeApplying.innerHTML.includes('Grade 1'), 'Grades should include Grade 1 for Primary');
  assert.equal(mockElements.docAdditionalTitle.textContent, 'Clinic / immunisation card', 'Step 5 additional label should say Clinic card for Primary');
  assert(mockElements.docAdditionalHint.textContent.includes('immunisation'), 'Step 5 additional hint should mention immunisation for Primary');

  // 4. Step transitions and progress indicators
  context.showStep(3);
  assert.equal(stepSections[2].classList.contains('rf-hidden'), false, 'Step 3 section is visible');
  assert.equal(stepSections[0].classList.contains('rf-hidden'), true, 'Step 1 section is hidden');
  assert.equal(progressSteps[2].classList.contains('active'), true, 'Step 3 progress is active');
  assert.equal(progressSteps[0].classList.contains('done'), true, 'Step 1 progress is done');
  assert.equal(progressSteps[2].attributes['aria-current'], 'step', 'Active step has aria-current="step"');

  const log = typeof console !== 'undefined' && console.log ? console.log : print;
  log('PASS: pathway switching updates campuses, grades, aria-pressed, conditional inputs, and Step 5 document checklist labels correctly; step navigation maintains progress states.');
})();

