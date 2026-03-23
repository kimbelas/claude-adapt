/**
 * Perfect Score — public API surface.
 *
 * All consumer-facing types and classes are re-exported from this entry point.
 * Internal module paths should not be imported directly.
 *
 * @packageDocumentation
 */

export { UserService } from './services/user-service.js';
export type { User, CreateUserDto, UpdateUserDto } from './services/user-service.js';

export {
  formatCurrency,
  slugify,
  truncate,
  deepClone,
} from './utils/helpers.js';
