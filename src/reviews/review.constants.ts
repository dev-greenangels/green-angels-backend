import { PERSON_NAME_REGEX } from '../common/person-name'

export { PERSON_NAME_REGEX }

/** Legacy flat files + processed pair (`…/{uuid}/main.webp`). */
export const REVIEW_IMAGE_PATH_REGEX =
  /^\/uploads\/reviews\/(?:[a-f0-9-]+\.(jpg|jpeg|png|webp|gif)|[a-f0-9-]+\/main\.webp)$/i

export const REVIEW_IMAGE_MAX_PER_PRODUCT = 3
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024
