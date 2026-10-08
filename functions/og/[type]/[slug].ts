/**
 * Cloudflare Pages Function: GET /og/:type/:slug share cards. The logic, and
 * who may see which card, lives in api/routes/og-card.ts (typechecked and
 * tested with the rest of api/).
 */

import { handleOgCard } from '../../../api/routes/og-card'
import type { Env } from '../../../api/types'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handleOgCard(String(context.params.type), String(context.params.slug), context.request, context.env)
}
