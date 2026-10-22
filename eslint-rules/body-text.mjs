// body/body-text: free text a person or Claude wrote (`x.description`,
// `x.notes`, `x.content`) must render through <BodyText> (src/components/BodyText.tsx)
// so URLs and [text](url) become clickable. Rendering it as a bare JSX child
// leaves links dead (Nick 2026-10-22: "why any link in the description isn't a
// hyperlink i can click").
//
// Refuses: <p>{task.description}</p>, <p>{task?.notes}</p>,
//          <p>{stripMeetingMarker(task.description)}</p>
// Allows:  <BodyText text={task.description} />, attribute values, string
//          ops (.replace/.slice), and `a || b` title fallbacks.
//
// A reasoned exception (a one-line truncated title that sits inside a link or
// button, where a nested anchor is invalid):
//   // eslint-disable-next-line body/body-text -- <why>
const BODY_PROPS = new Set(['description', 'notes', 'content'])

function isBodyMember(node) {
  if (!node) return false
  if (node.type === 'ChainExpression') return isBodyMember(node.expression)
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    BODY_PROPS.has(node.property.name)
  )
}

export default {
  meta: {
    type: 'problem',
    messages: {
      bare: 'Render free text through <BodyText text={...} /> (src/components/BodyText.tsx) so links are clickable, not as a bare JSX child.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXExpressionContainer(node) {
        const parent = node.parent
        if (!parent || (parent.type !== 'JSXElement' && parent.type !== 'JSXFragment')) return
        const e = node.expression
        const direct = isBodyMember(e)
        const wrapped =
          e.type === 'CallExpression' &&
          e.callee.type === 'Identifier' &&
          e.arguments.length === 1 &&
          isBodyMember(e.arguments[0])
        if (direct || wrapped) context.report({ node, messageId: 'bare' })
      },
    }
  },
}
