// body/body-text (eslint-rules/body-text.mjs): free text (description, notes,
// content) renders through <BodyText> so URLs are clickable. Nick 2026-10-22:
// "why any link in the description isn't a hyperlink i can click".

import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import bodyText from '../../../eslint-rules/body-text.mjs'

const linter = new Linter({ configType: 'flat' })
const config = [{
  files: ['**/*.tsx'],
  languageOptions: { parser: tseslint.parser },
  plugins: { body: { rules: { 'body-text': bodyText } } },
  rules: { 'body/body-text': 'error' as const },
}]

function ids(code: string): string[] {
  return linter.verify(code, config, 'site.tsx').map((m) => m.messageId ?? m.message)
}

describe('body/body-text', () => {
  it('refuses free text as a bare JSX child', () => {
    expect(ids('const a = <p>{task.description}</p>')).toEqual(['bare'])
    expect(ids('const a = <div>{idea?.notes}</div>')).toEqual(['bare'])
    expect(ids('const a = <span>{item.content}</span>')).toEqual(['bare'])
  })

  it('refuses a marker-stripping wrapper around the same field', () => {
    expect(ids('const a = <div>{stripMeetingMarker(task.description)}</div>')).toEqual(['bare'])
  })

  it('allows BodyText, attribute values, string ops and title fallbacks', () => {
    expect(ids('const a = <BodyText text={task.description} />')).toEqual([])
    expect(ids('const a = <Row title={task.description} />')).toEqual([])
    expect(ids('const a = <span>{item.description.replace(/x/, "")}</span>')).toEqual([])
    expect(ids('const a = <span>{task.title || task.description}</span>')).toEqual([])
    expect(ids('const a = <span>{task.name}</span>')).toEqual([])
  })
})
