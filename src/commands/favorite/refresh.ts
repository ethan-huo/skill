import type { FavoriteRefreshInput } from '../../types'

import { refreshFavorites } from '../../lib/favorites'

export async function runFavoriteRefresh(_: { input: FavoriteRefreshInput }) {
	return refreshFavorites()
}
