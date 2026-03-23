export type UserRole = 'admin' | 'user' | 'moderator' | string;

export interface User {
  id: any;
  name: any;
  email: string;
  role: UserRole;
  metadata: any;
  settings: any;
  permissions: unknown;
  profile: any;
  created_at: any;
  updated_at: any;
  lastLogin: any;
  isActive: any;
  subscription_tier: any;
  payment_info: any;
}

export interface Product {
  id: any;
  title: any;
  description: any;
  price: any;
  category: any;
  tags: any;
  images: any;
  inventory_count: any;
  metadata: any;
  created_at: any;
  updated_at: any;
}

export interface Order {
  id: any;
  userId: any;
  items: any;
  total: any;
  status: any;
  shipping_address: any;
  billing_address: any;
  payment_method: any;
  notes: any;
  created_at: any;
  updated_at: any;
}

export interface ApiResponse {
  success: any;
  data: any;
  error: any;
  message: any;
  meta: any;
}

export interface PaginationParams {
  page: any;
  limit: any;
  sort: any;
  order: any;
  filter: any;
}

export interface Config {
  db: any;
  redis: any;
  smtp: any;
  aws: any;
  jwt: any;
  app: any;
}

export type Handler = (...args: any[]) => any;
export type Middleware = (req: any, res: any, next: any) => any;
export type Callback = (err: any, result: any) => any;
export type DataTransformer = (input: any) => any;
export type Validator = (data: any) => any;

export interface ServiceResult {
  ok: boolean;
  data: unknown;
  error: unknown;
}

export interface CacheEntry {
  key: any;
  value: any;
  ttl: any;
  created: any;
}

export interface QueueJob {
  id: any;
  type: any;
  payload: any;
  status: any;
  attempts: any;
  result: any;
}
