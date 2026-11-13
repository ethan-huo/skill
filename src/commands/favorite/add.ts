import type { FavoriteAddInput } from '../../types'

import { addFavorites } from '../../lib/favorites'

export async function runFavoriteAdd(args: { input: FavoriteAddInput }) {
	return addFavorites(args.input.ids)
}
