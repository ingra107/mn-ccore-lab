// local/icon-button -- an icon-only button is built with the shared Button at
// size="icon", never by hand (PB backlog #1366, 2026-10-14).
//
// Why: every hand-rolled icon button re-derived its own size, so the WCAG
// 2.5.8 24x24 floor drifted per site (the Today dismiss tip measured 21x20
// live), and 28 of 108 had no accessible name at all. Button size="icon"
// carries both: a real 24x24 box (44x44 on touch, .btn-icon in index.css) and
// an `aria-label` the type REQUIRES. This rule refuses the two shapes that
// bypass it:
//   raw    a lowercase <button> whose content is only icons or a 1-2 character
//          glyph (x, +, a chevron);
//   size   a <Button> with icon-only content at a text size (sm/md/lg).
// "Icon" means an <svg>, a lucide-react import, or a component named *Icon /
// *Mark. Anything the rule cannot read as an icon (a {variable}, a call) is
// treated as text, so a false positive needs real icon-only markup.
// A reasoned exception: `// eslint-disable-next-line local/icon-button -- <why>`.

const MSG_RAW =
  'Icon-only <button>: use <Button size="icon" aria-label="..."> from components/ui/Button, which carries the 24px target and the accessible name.'
const MSG_SIZE =
  'Icon-only <Button> at a text size: use size="icon" so it gets the 24px box (44px on touch).'

function elementName(node) {
  const n = node.openingElement ? node.openingElement.name : node.name
  if (n.type === 'JSXIdentifier') return n.name
  if (n.type === 'JSXMemberExpression') return n.property.name
  return null
}

export default {
  meta: {
    type: 'problem',
    messages: { raw: MSG_RAW, size: MSG_SIZE },
    schema: [],
  },
  create(context) {
    const lucide = new Set()

    const isIconElement = (el) => {
      const name = elementName(el)
      if (!name) return false
      return name === 'svg' || lucide.has(name) || /(?:Icon|Mark)$/.test(name)
    }

    // 'icon' | 'empty' | 'text' for one child node.
    const kindOf = (child) => {
      if (child.type === 'JSXText') {
        const t = child.value.trim()
        if (t === '') return 'empty'
        return [...t].length <= 2 ? 'icon' : 'text'
      }
      if (child.type === 'JSXElement') return isIconElement(child) ? 'icon' : 'text'
      if (child.type === 'JSXExpressionContainer') return kindOfExpr(child.expression)
      return 'text'
    }
    const kindOfExpr = (e) => {
      if (!e || e.type === 'JSXEmptyExpression') return 'empty'
      if (e.type === 'Literal' && (e.value === null || e.value === false)) return 'empty'
      if (e.type === 'Literal' && typeof e.value === 'string') {
        const t = e.value.trim()
        return t === '' ? 'empty' : [...t].length <= 2 ? 'icon' : 'text'
      }
      if (e.type === 'JSXElement') return isIconElement(e) ? 'icon' : 'text'
      if (e.type === 'ConditionalExpression') return merge([kindOfExpr(e.consequent), kindOfExpr(e.alternate)])
      if (e.type === 'LogicalExpression') return merge([kindOfExpr(e.right)])
      return 'text'
    }
    const merge = (kinds) => {
      if (kinds.includes('text')) return 'text'
      return kinds.includes('icon') ? 'icon' : 'empty'
    }
    const iconOnly = (node) => merge(node.children.map(kindOf)) === 'icon'

    const attr = (node, name) =>
      node.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name)

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'lucide-react') return
        for (const s of node.specifiers) if (s.type === 'ImportSpecifier') lucide.add(s.local.name)
      },
      JSXElement(node) {
        const name = elementName(node)
        if (name === 'button') {
          if (iconOnly(node)) context.report({ node: node.openingElement, messageId: 'raw' })
          return
        }
        if (name === 'Button') {
          const size = attr(node, 'size')
          const isIcon = size && size.value && size.value.type === 'Literal' && size.value.value === 'icon'
          if (!isIcon && !size?.value?.expression && iconOnly(node)) {
            context.report({ node: node.openingElement, messageId: 'size' })
          }
        }
      },
    }
  },
}
