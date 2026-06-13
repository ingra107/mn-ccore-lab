#!/usr/bin/env node
/*
 * Rule 74 follow-on: dynamic prop-passed icons. Components render a lucide icon
 * received via props (typed `LucideIcon`), conventionally named `Icon` /
 * `IconComponent`. The static-name codemod can't see these (the JSX tag is a
 * local variable, not a lucide import). Same AST + offset-splice approach,
 * gated to files that import from lucide-react. tsc verifies every target
 * actually accepts strokeWidth/absoluteStrokeWidth (lucide does).
 *
 *   node scripts/icon-props-codemod-dynamic.cjs          # dry run
 *   node scripts/icon-props-codemod-dynamic.cjs --apply
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const APPLY = process.argv.includes('--apply')
const SRC = path.join(__dirname, '..', 'src')
const ICON_PROPS_ABS = path.join(SRC, 'lib', 'iconProps.ts')
const DYNAMIC_NAMES = new Set(['Icon', 'IconComponent'])
const MAX_SIZE = 20

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (e.name.endsWith('.tsx')) acc.push(full)
  }
  return acc
}
function relImport(fromFile) {
  let rel = path.relative(path.dirname(fromFile), ICON_PROPS_ABS).replace(/\\/g, '/').replace(/\.ts$/, '')
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

let totalEdits = 0, totalFiles = 0
const samples = []
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8')
  if (!/from\s+['"]lucide-react['"]/.test(text)) continue
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  let hasIconPropsImport = false
  let lastImportEnd = 0
  sf.statements.forEach((st) => {
    if (ts.isImportDeclaration(st)) {
      lastImportEnd = st.end
      const spec = st.moduleSpecifier.text
      const named = st.importClause?.namedBindings
      if ((/\/iconProps$/.test(spec) || spec.endsWith('lib/iconProps')) && named && ts.isNamedImports(named))
        named.elements.forEach((el) => { if (el.name.text === 'ICON_PROPS') hasIconPropsImport = true })
    }
  })

  const inserts = []
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName
      if (ts.isIdentifier(tag) && DYNAMIC_NAMES.has(tag.text)) {
        const attrs = node.attributes.properties
        let sizeOk = false, alreadyHas = false
        for (const a of attrs) {
          if (ts.isJsxSpreadAttribute(a)) { alreadyHas = true; continue }
          if (ts.isJsxAttribute(a) && a.name) {
            const n = a.name.getText(sf)
            if (n === 'strokeWidth' || n === 'absoluteStrokeWidth') alreadyHas = true
            if (n === 'size' && a.initializer && ts.isJsxExpression(a.initializer)) {
              const ex = a.initializer.expression
              if (ex && ts.isNumericLiteral(ex) && Number(ex.text) <= MAX_SIZE) sizeOk = true
            }
          }
        }
        if (sizeOk && !alreadyHas) inserts.push({ pos: tag.end, text: ' {...ICON_PROPS}' })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (inserts.length === 0) continue

  let out = text
  inserts.sort((a, b) => b.pos - a.pos).forEach((ins) => { out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos) })
  if (!hasIconPropsImport) out = out.slice(0, lastImportEnd) + `\nimport { ICON_PROPS } from '${relImport(file)}'` + out.slice(lastImportEnd)

  totalEdits += inserts.length; totalFiles += 1
  if (samples.length < 12) samples.push(`${path.relative(SRC, file)}: ${inserts.length}, import=${hasIconPropsImport ? 'exists' : 'added'}`)
  if (APPLY) fs.writeFileSync(file, out, 'utf8')
}
console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}: ${totalEdits} dynamic-icon sites across ${totalFiles} files`)
console.log('Samples:\n  ' + samples.join('\n  '))
