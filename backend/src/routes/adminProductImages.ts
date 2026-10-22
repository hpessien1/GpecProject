import express, { Router } from 'express'
import { HttpError, ValidationError } from '../errors.js'
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES, saveProductImage } from '../services/productImages.js'
import type { ImageStore } from '../services/imageStore.js'

// POST /api/admin/product-images: a product photo from the admin's device, sent as the request body
// with its own type (image/jpeg, image/png, or image/webp). Mounted behind requireAdmin in app.ts, so
// the body is read only for a logged-in admin. Answers { image }, the value to save in the product's
// image field; the product itself changes (and is recorded) only when the admin saves the form.
export default function adminProductImagesRouter(store: ImageStore | null) {
  const router = Router()

  router.post('/', express.raw({ type: UPLOAD_TYPES, limit: MAX_UPLOAD_BYTES }), async (req, res, next) => {
    try {
      if (!store) throw new HttpError(503, 'Photo uploads are not set up yet.', 'IMAGE_UPLOADS_OFF')
      // Any other declared type is not read at all, so the body is not a Buffer.
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError({ image: 'Choose a JPEG, PNG, or WebP photo.' }, 'Choose a JPEG, PNG, or WebP photo.')
      return res.status(201).json({ image: await saveProductImage(store, req.body) })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
