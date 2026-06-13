#!/usr/bin/env node
/*
 * Rule 74 site-wide icon-discipline codemod.
 * Adds `{...ICON_PROPS}` (strokeWidth:1.5, absoluteStrokeWidth:true) to every
 * lucide-react icon rendered as JSX with an explicit numeric size <= 20 that
 * does not already carry strokeWidth / absoluteStrokeWidth / a spread.
 * AST-driven (TypeScript compiler API) so it only touches real JSX icon tags
 * (never `icon={User}` prop passes), and offset-spliced so formatting is preserved.
 *
 * Usage:
 *   node scripts/icon-props-codemod.cjs            # dry run (report only)
 *   node scripts/icon-props-codemod.cjs --apply    # write changes
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const APPLY = process.argv.includes('--apply')
const SRC = path.join(__dirname, '..', 'src')
const ICON_PROPS_ABS = path.join(SRC, 'lib', 'iconProps.ts')
const MAX_SIZE = 20

/** recursively collect .tsx files under dir */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (e.name.endsWith('.tsx')) acc.push(full)
  }
  return acc
}

function relImport(fromFile) {
  let rel = path
    .relative(path.dirname(fromFile), ICON_PROPS_ABS)
    .replace(/\\/g, '/')
    .replace(/\.ts$/, '')
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

let totalEdits = 0
let totalFiles = 0
const samples = []

for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8')
  if (!/from\s+['"]lucide-react['"]/.test(text)) continue

  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  // 1. collect lucide-imported identifiers + detect existing ICON_PROPS import
  const lucide = new Set()
  let hasIconPropsImport = false
  let lastImportEnd = 0
  sf.statements.forEach((st) => {
    if (ts.isImportDeclaration(st)) {
      lastImportEnd = st.end
      const spec = st.moduleSpecifier.text
      const named = st.importClause?.namedBindings
      if (spec === 'lucide-react' && named && ts.isNamedImports(named)) {
        named.elements.forEach((el) => lucide.add(el.name.text))
      }
      if (/\/iconProps$/.test(spec) || spec.endsWith('lib/iconProps')) {
        if (named && ts.isNamedImports(named)) {
          named.elements.forEach((el) => {
            if (el.name.text === 'ICON_PROPS') hasIconPropsImport = true
          })
        }
      }
    }
  })
  if (lucide.size === 0) continue

  // 2. find target JSX icon tags
  const inserts = [] // { pos, text }
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName
      if (ts.isIdentifier(tag) && lucide.has(tag.text)) {
        const attrs = node.attributes.properties
        let sizeOk = false
        let alreadyHas = false
        for (const a of attrs) {
          if (ts.isJsxSpreadAttribute(a)) {
            // a spread of ICON_PROPS (or anything) -> leave alone
            alreadyHas = true
            continue
          }
          if (ts.isJsxAttribute(a) && a.name) {
            const n = a.name.getText(sf)
            if (n === 'strokeWidth' || n === 'absoluteStrokeWidth') alreadyHas = true
            if (n === 'size' && a.initializer && ts.isJsxExpression(a.initializer)) {
              const ex = a.initializer.expression
              if (ex && ts.isNumericLiteral(ex) && Number(ex.text) <= MAX_SIZE) sizeOk = true
            }
          }
        }
        if (sizeOk && !alreadyHas) {
          // insert right after the tag name identifier
          inserts.push({ pos: tag.end, text: ' {...ICON_PROPS}' })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  if (inserts.length === 0) continue

  // 3. apply offset splices (descending so positions stay valid)
  let out = text
  inserts
    .sort((a, b) => b.pos - a.pos)
    .forEach((ins) => {
      out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos)
    })

  // 4. add import if missing (after the last import statement)
  if (!hasIconPropsImport) {
    const importLine = `\nimport { ICON_PROPS } from '${relImport(file)}'`
    // lastImportEnd is an offset into the ORIGINAL text; all inserts are at JSX
    // positions which are after the imports, so lastImportEnd is still valid.
    out = out.slice(0, lastImportEnd) + importLine + out.slice(lastImportEnd)
  }

  totalEdits += inserts.length
  totalFiles += 1
  if (samples.length < 6) {
    samples.push(`${path.relative(SRC, file)}: ${inserts.length} icons, import=${hasIconPropsImport ? 'exists' : 'added'}`)
  }

  if (APPLY) fs.writeFileSync(file, out, 'utf8')
}

console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}: ${totalEdits} icon sites across ${totalFiles} files`)
console.log('Samples:\n  ' + samples.join('\n  '))
