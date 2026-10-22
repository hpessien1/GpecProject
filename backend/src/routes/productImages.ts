import { Router } from 'express'
import { NotFoundError } from '../errors.js'
import type { ImageStore } from '../services/imageStore.js'

const NAME_PATTERN = /^[0-9a-f]{64}\.webp$/

// GET /api/product-images/<name>.webp: uploaded product photos for the shop, read from the private
// bucket. A name never changes its content (services/productImages.ts), so browsers keep each photo
// for a year and ask again only for new ones.
export default function productImagesRouter(store: ImageStore | null) {
  const router = Router()

  router.get('/:name', async (req, res, next) => {
    try {
      const name = req.params.name
      if (!store || !NAME_PATTERN.test(name)) throw new NotFoundError('Image not found.')
      const image = await store.get(`product-images/${name}`)
      if (!image) throw new NotFoundError('Image not found.')
      res.set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        // helmet allows same-origin use only; the site is on another origin than the API.
        'Cross-Origin-Resource-Policy': 'cross-origin',
      })
      return res.send(Buffer.from(image.body))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
