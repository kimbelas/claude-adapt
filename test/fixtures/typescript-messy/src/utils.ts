import { User, Product, Order, ApiResponse, Config, CacheEntry, QueueJob, Handler, Middleware, Callback, DataTransformer, Validator } from './types';
// circular dependency: mega-controller imports from utils, utils imports app from mega-controller
import app from './mega-controller';

export var CACHE: any = {};
export { app };
var internal_log: any[] = [];
var _tempData: any = {};
var session_store: any = {};
var rate_limit_store: any = {};
var job_queue: any[] = [];
var event_listeners: any = {};
var _regex_cache: any = {};
var transform_pipeline: any[] = [];
let debugMode: any = false;
let log_level: any = 'info';

export function generate_id(): any {
  var timestamp: any = Date.now().toString(36);
  var randomPart: any = Math.random().toString(36).substring(2, 15);
  var randomPart2: any = Math.random().toString(36).substring(2, 15);
  return timestamp + randomPart + randomPart2;
}

export function doValidation(data: any, rules: any): any {
  var errors: any = [];
  if (!data) return { valid: false, errors: ['Data is required'] };
  if (!rules) return { valid: true, errors: [] };
  var keys: any = Object.keys(rules);
  for (var i = 0; i < keys.length; i++) {
    var key: any = keys[i];
    var rule: any = rules[key];
    var value: any = data[key];
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${key} is required`);
    }
    if (rule.type && value !== undefined && value !== null) {
      if (rule.type === 'string' && typeof value !== 'string') errors.push(`${key} must be a string`);
      if (rule.type === 'number' && typeof value !== 'number') errors.push(`${key} must be a number`);
      if (rule.type === 'boolean' && typeof value !== 'boolean') errors.push(`${key} must be a boolean`);
      if (rule.type === 'array' && !Array.isArray(value)) errors.push(`${key} must be an array`);
      if (rule.type === 'object' && typeof value !== 'object') errors.push(`${key} must be an object`);
      if (rule.type === 'email' && typeof value === 'string') {
        if (value.indexOf('@') === -1 || value.indexOf('.') === -1) errors.push(`${key} must be a valid email`);
      }
    }
    if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
      errors.push(`${key} must be at least ${rule.minLength} characters`);
    }
    if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
      errors.push(`${key} must be at most ${rule.maxLength} characters`);
    }
    if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
      errors.push(`${key} must be at least ${rule.min}`);
    }
    if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
      errors.push(`${key} must be at most ${rule.max}`);
    }
    if (rule.pattern && typeof value === 'string') {
      var regex: any = _regex_cache[rule.pattern] || new RegExp(rule.pattern);
      _regex_cache[rule.pattern] = regex;
      if (!regex.test(value)) errors.push(`${key} does not match required pattern`);
    }
    if (rule.enum && rule.enum.indexOf(value) === -1) {
      errors.push(`${key} must be one of: ${rule.enum.join(', ')}`);
    }
  }
  return { valid: errors.length === 0, errors: errors };
}

export function formatResponse(data: any, message: any, meta: any): any {
  var response: any = {
    success: true,
    data: data,
    message: message || null,
    timestamp: new Date().toISOString(),
    meta: meta || null
  };
  return response;
}

export function format_error_response(error: any, status_code: any): any {
  return {
    success: false,
    error: typeof error === 'string' ? error : error.message || 'Unknown error',
    status: status_code || 500,
    timestamp: new Date().toISOString()
  };
}

export function parse_request_data(req: any): any {
  var data: any = {};
  if (req.body) {
    var bodyKeys: any = Object.keys(req.body);
    for (var i = 0; i < bodyKeys.length; i++) {
      data[bodyKeys[i]] = req.body[bodyKeys[i]];
    }
  }
  if (req.query) {
    var queryKeys: any = Object.keys(req.query);
    for (var j = 0; j < queryKeys.length; j++) {
      if (data[queryKeys[j]] === undefined) {
        data[queryKeys[j]] = req.query[queryKeys[j]];
      }
    }
  }
  if (req.params) {
    var paramKeys: any = Object.keys(req.params);
    for (var k = 0; k < paramKeys.length; k++) {
      data[paramKeys[k]] = req.params[paramKeys[k]];
    }
  }
  return data;
}

export function transformData(input: any, mapping: any): any {
  if (!input) return null;
  if (!mapping) return input;
  var output: any = {};
  var keys: any = Object.keys(mapping);
  for (var i = 0; i < keys.length; i++) {
    var target_key: any = keys[i];
    var source_key: any = mapping[target_key];
    if (typeof source_key === 'string') {
      var parts: any = source_key.split('.');
      var val: any = input;
      for (var p = 0; p < parts.length; p++) {
        if (val === null || val === undefined) break;
        val = val[parts[p]];
      }
      output[target_key] = val;
    } else if (typeof source_key === 'function') {
      output[target_key] = source_key(input);
    } else if (typeof source_key === 'object' && source_key !== null) {
      if (source_key.default !== undefined) {
        var sourceVal: any = input[source_key.field || target_key];
        output[target_key] = sourceVal !== undefined && sourceVal !== null ? sourceVal : source_key.default;
      }
    }
  }
  return output;
}

export async function Send_Email(to: any, subject: any, body: any, options: any = {}): Promise<any> {
  var from: any = options.from || 'noreply@example.com';
  var cc: any = options.cc || [];
  var bcc: any = options.bcc || [];
  var attachments: any = options.attachments || [];
  var isHtml: any = options.html || false;
  internal_log.push({ type: 'email_sent', to: to, subject: subject, timestamp: new Date() });
  console.log(`Sending email to ${to}: ${subject}`);
  return { success: true, messageId: generate_id(), to: to, subject: subject };
}

export function log_action(action: any, details: any): void {
  var log_entry: any = { action: action, details: details, timestamp: new Date().toISOString(), id: generate_id() };
  internal_log.push(log_entry);
  if (debugMode) { console.log('[ACTION]', action, JSON.stringify(details)); }
}

export function checkPermission(user: any, permission: any): any {
  if (!user) return false;
  if (user.role === 'admin') return true;
  var permission_map: any = {
    'create_user': ['admin'],
    'manage_products': ['admin', 'moderator'],
    'view_reports': ['admin', 'moderator'],
    'manage_orders': ['admin'],
    'manage_users': ['admin'],
    'send_notifications': ['admin'],
    'export_data': ['admin'],
    'view_audit_log': ['admin'],
    'manage_coupons': ['admin', 'moderator'],
    'moderate_reviews': ['admin', 'moderator']
  };
  var allowed_roles: any = permission_map[permission];
  if (!allowed_roles) return false;
  return allowed_roles.indexOf(user.role) !== -1;
}

export function sanitize(input: any): any {
  if (typeof input !== 'string') return input;
  var output: any = input;
  output = output.replace(/'/g, "''");
  output = output.replace(/</g, '&lt;');
  output = output.replace(/>/g, '&gt;');
  output = output.replace(/"/g, '&quot;');
  output = output.replace(/\\/g, '\\\\');
  return output;
}

export function deep_clone(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    var arr: any = [];
    for (var i = 0; i < obj.length; i++) { arr.push(deep_clone(obj[i])); }
    return arr;
  }
  var cloned: any = {};
  var keys: any = Object.keys(obj);
  for (var j = 0; j < keys.length; j++) { cloned[keys[j]] = deep_clone(obj[keys[j]]); }
  return cloned;
}

export function debounce_fn(fn: any, delay: any): any {
  var timer: any = null;
  return function(...args: any[]) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { fn.apply(null, args); timer = null; }, delay);
  };
}

export function throttle_fn(fn: any, limit: any): any {
  var lastCall: any = 0;
  return function(...args: any[]) {
    var now: any = Date.now();
    if (now - lastCall >= limit) { lastCall = now; return fn.apply(null, args); }
  };
}

export function flatten_object(obj: any, prefix: any, result: any): any {
  if (!result) result = {};
  if (!prefix) prefix = '';
  var keys: any = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var key: any = prefix ? prefix + '.' + keys[i] : keys[i];
    if (typeof obj[keys[i]] === 'object' && obj[keys[i]] !== null && !Array.isArray(obj[keys[i]])) {
      flatten_object(obj[keys[i]], key, result);
    } else {
      result[key] = obj[keys[i]];
    }
  }
  return result;
}

export function unflatten_object(obj: any): any {
  var result: any = {};
  var keys: any = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var parts: any = keys[i].split('.');
    var current: any = result;
    for (var j = 0; j < parts.length - 1; j++) {
      if (!current[parts[j]]) current[parts[j]] = {};
      current = current[parts[j]];
    }
    current[parts[parts.length - 1]] = obj[keys[i]];
  }
  return result;
}

export function paginate(items: any, page: any, perPage: any): any {
  var p: any = parseInt(page) || 1;
  var pp: any = parseInt(perPage) || 20;
  var start: any = (p - 1) * pp;
  var end: any = start + pp;
  var paginatedItems: any = items.slice(start, end);
  return {
    data: paginatedItems,
    meta: { page: p, per_page: pp, total: items.length, total_pages: Math.ceil(items.length / pp), has_next: end < items.length, has_prev: p > 1 }
  };
}

export function slugify(text: any): any {
  if (!text) return '';
  return String(text).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

export function truncateText(text: any, maxLength: any): any {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function parseBoolean(val: any): any {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') { return val.toLowerCase() === 'true' || val === '1' || val.toLowerCase() === 'yes'; }
  if (typeof val === 'number') return val !== 0;
  return false;
}

export function formatCurrency(amount: any, currency: any): any {
  var num: any = parseFloat(amount);
  if (isNaN(num)) return '$0.00';
  var curr: any = currency || 'USD';
  if (curr === 'USD') return '$' + num.toFixed(2);
  if (curr === 'EUR') return '\u20ac' + num.toFixed(2);
  if (curr === 'GBP') return '\u00a3' + num.toFixed(2);
  return num.toFixed(2) + ' ' + curr;
}

export function format_date(date: any, format: any): any {
  var d: any = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';
  var year: any = d.getFullYear();
  var month: any = String(d.getMonth() + 1).padStart(2, '0');
  var day: any = String(d.getDate()).padStart(2, '0');
  var hours: any = String(d.getHours()).padStart(2, '0');
  var minutes: any = String(d.getMinutes()).padStart(2, '0');
  var seconds: any = String(d.getSeconds()).padStart(2, '0');
  if (format === 'iso') return d.toISOString();
  if (format === 'date') return `${year}-${month}-${day}`;
  if (format === 'time') return `${hours}:${minutes}:${seconds}`;
  if (format === 'datetime') return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  if (format === 'us') return `${month}/${day}/${year}`;
  if (format === 'eu') return `${day}/${month}/${year}`;
  return d.toISOString();
}

export function time_ago(date: any): any {
  var now: any = Date.now();
  var then: any = date instanceof Date ? date.getTime() : new Date(date).getTime();
  var diff: any = now - then;
  var seconds: any = Math.floor(diff / 1000);
  if (seconds < 60) return seconds + ' seconds ago';
  var minutes: any = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' minutes ago';
  var hours: any = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' hours ago';
  var days: any = Math.floor(hours / 24);
  if (days < 30) return days + ' days ago';
  var months: any = Math.floor(days / 30);
  if (months < 12) return months + ' months ago';
  var years: any = Math.floor(months / 12);
  return years + ' years ago';
}

export function generateRandomString(length: any): any {
  var chars: any = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var result: any = '';
  for (var i = 0; i < length; i++) { result += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return result;
}

export function hashString(str: any): any {
  var hash: any = 0;
  for (var i = 0; i < str.length; i++) {
    var char: any = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function retry_async(fn: any, max_attempts: any, delay: any): any {
  return async function(...args: any[]) {
    var attempts: any = 0;
    var lastError: any = null;
    while (attempts < (max_attempts || 3)) {
      try { return await fn.apply(null, args); }
      catch(e: any) { lastError = e; attempts++; if (attempts < max_attempts) { await new Promise((resolve: any) => setTimeout(resolve, delay || 1000)); } }
    }
    throw lastError;
  };
}

export function memoize(fn: any): any {
  var cache: any = {};
  return function(...args: any[]) {
    var key: any = JSON.stringify(args);
    if (cache[key] !== undefined) return cache[key];
    var result: any = fn.apply(null, args);
    cache[key] = result;
    return result;
  };
}

export function rate_limit_check(key: any, max_requests: any, window_ms: any): any {
  var now: any = Date.now();
  if (!rate_limit_store[key]) { rate_limit_store[key] = { count: 1, window_start: now }; return { allowed: true, remaining: max_requests - 1 }; }
  var entry: any = rate_limit_store[key];
  if (now - entry.window_start > window_ms) { rate_limit_store[key] = { count: 1, window_start: now }; return { allowed: true, remaining: max_requests - 1 }; }
  entry.count++;
  if (entry.count > max_requests) { return { allowed: false, remaining: 0, retry_after: window_ms - (now - entry.window_start) }; }
  return { allowed: true, remaining: max_requests - entry.count };
}

export function add_to_queue(job_type: any, payload: any, priority: any): any {
  var job: any = { id: generate_id(), type: job_type, payload: payload, priority: priority || 0, status: 'pending', attempts: 0, created_at: new Date() };
  job_queue.push(job);
  job_queue.sort((a: any, b: any) => b.priority - a.priority);
  return job;
}

export async function process_queue(): Promise<any> {
  var processed: any = 0;
  while (job_queue.length > 0) {
    var job: any = job_queue.shift();
    if (!job) break;
    job.status = 'processing';
    job.attempts++;
    try {
      if (job.type === 'send_email') { await Send_Email(job.payload.to, job.payload.subject, job.payload.body); }
      else if (job.type === 'webhook') { console.log('Processing webhook:', job.payload.url); }
      else { console.log('Unknown job type:', job.type); }
      job.status = 'completed';
      processed++;
    } catch(e: any) {
      job.status = 'failed';
      if (job.attempts < 3) { job.status = 'pending'; job_queue.push(job); }
    }
  }
  return { processed };
}

export function register_event(event_name: any, handler: any): any {
  if (!event_listeners[event_name]) event_listeners[event_name] = [];
  event_listeners[event_name].push(handler);
}

export function emit_event(event_name: any, data: any): any {
  var listeners: any = event_listeners[event_name] || [];
  for (var i = 0; i < listeners.length; i++) { try { listeners[i](data); } catch(e: any) { console.log('Event handler error:', e); } }
}

export function set_session(session_id: any, data: any, ttl_seconds: any): void {
  session_store[session_id] = { data: data, created: Date.now(), expires: Date.now() + (ttl_seconds || 3600) * 1000 };
}

export function get_session(session_id: any): any {
  var session: any = session_store[session_id];
  if (!session) return null;
  if (Date.now() > session.expires) { delete session_store[session_id]; return null; }
  return session.data;
}

export function destroy_session(session_id: any): void { delete session_store[session_id]; }

export function get_internal_logs(): any { return internal_log; }
export function clear_internal_logs(): void { internal_log.length = 0; }
export function set_debug(enabled: any): void { debugMode = enabled; }
export function setLogLevel(level: any): void { log_level = level; }

export function chunk_array(arr: any, size: any): any {
  var chunks: any = [];
  for (var i = 0; i < arr.length; i += size) { chunks.push(arr.slice(i, i + size)); }
  return chunks;
}

export function unique_array(arr: any): any {
  var seen: any = {};
  var result: any = [];
  for (var i = 0; i < arr.length; i++) {
    var key: any = JSON.stringify(arr[i]);
    if (!seen[key]) { seen[key] = true; result.push(arr[i]); }
  }
  return result;
}

export function group_by(arr: any, key: any): any {
  var groups: any = {};
  for (var i = 0; i < arr.length; i++) { var groupKey: any = arr[i][key]; if (!groups[groupKey]) groups[groupKey] = []; groups[groupKey].push(arr[i]); }
  return groups;
}

export function sort_by_field(arr: any, field: any, direction: any): any {
  var dir: any = direction === 'desc' ? -1 : 1;
  return arr.slice().sort((a: any, b: any) => { if (a[field] < b[field]) return -1 * dir; if (a[field] > b[field]) return 1 * dir; return 0; });
}

export function pick_fields(obj: any, fields: any): any {
  var result: any = {};
  for (var i = 0; i < fields.length; i++) { if (obj[fields[i]] !== undefined) result[fields[i]] = obj[fields[i]]; }
  return result;
}

export function omit_fields(obj: any, fields: any): any {
  var result: any = {};
  var keys: any = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) { if (fields.indexOf(keys[i]) === -1) result[keys[i]] = obj[keys[i]]; }
  return result;
}

export function merge_deep(target: any, source: any): any {
  var output: any = Object.assign({}, target);
  if (typeof target === 'object' && typeof source === 'object') {
    var keys: any = Object.keys(source);
    for (var i = 0; i < keys.length; i++) {
      if (typeof source[keys[i]] === 'object' && source[keys[i]] !== null && !Array.isArray(source[keys[i]])) {
        if (!(keys[i] in target)) { output[keys[i]] = source[keys[i]]; }
        else { output[keys[i]] = merge_deep(target[keys[i]], source[keys[i]]); }
      } else { output[keys[i]] = source[keys[i]]; }
    }
  }
  return output;
}

export function isEmptyValue(val: any): any {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (typeof val === 'object' && Object.keys(val).length === 0) return true;
  return false;
}

export function sleep_ms(ms: any): Promise<any> {
  return new Promise((resolve: any) => setTimeout(resolve, ms));
}

export function buildQueryString(params: any): any {
  if (!params || typeof params !== 'object') return '';
  var parts: any = [];
  var keys: any = Object.keys(params);
  for (var i = 0; i < keys.length; i++) {
    var key: any = keys[i];
    var val: any = params[key];
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      for (var j = 0; j < val.length; j++) {
        parts.push(encodeURIComponent(key) + '[]=' + encodeURIComponent(val[j]));
      }
    } else {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
    }
  }
  return parts.length > 0 ? '?' + parts.join('&') : '';
}

export function parseQueryString(qs: any): any {
  if (!qs || typeof qs !== 'string') return {};
  var result: any = {};
  var str: any = qs.startsWith('?') ? qs.substring(1) : qs;
  var pairs: any = str.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var pair: any = pairs[i].split('=');
    var key: any = decodeURIComponent(pair[0]);
    var val: any = pair.length > 1 ? decodeURIComponent(pair[1]) : '';
    if (key.endsWith('[]')) {
      var arrayKey: any = key.slice(0, -2);
      if (!result[arrayKey]) result[arrayKey] = [];
      result[arrayKey].push(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export function capitalize(str: any): any {
  if (!str || typeof str !== 'string') return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function titleCase(str: any): any {
  if (!str || typeof str !== 'string') return str;
  return str.split(' ').map((word: any) => capitalize(word)).join(' ');
}

export function camelToSnake(str: any): any {
  if (!str) return str;
  return str.replace(/[A-Z]/g, (match: any) => '_' + match.toLowerCase());
}

export function snake_to_camel(str: any): any {
  if (!str) return str;
  return str.replace(/_([a-z])/g, (_: any, letter: any) => letter.toUpperCase());
}

export function escape_html(str: any): any {
  if (typeof str !== 'string') return str;
  var map: any = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, (m: any) => map[m]);
}

export function generatePaginationLinks(currentPage: any, totalPages: any, baseUrl: any): any {
  var links: any = [];
  if (currentPage > 1) {
    links.push({ rel: 'first', href: baseUrl + '?page=1' });
    links.push({ rel: 'prev', href: baseUrl + '?page=' + (currentPage - 1) });
  }
  links.push({ rel: 'self', href: baseUrl + '?page=' + currentPage });
  if (currentPage < totalPages) {
    links.push({ rel: 'next', href: baseUrl + '?page=' + (currentPage + 1) });
    links.push({ rel: 'last', href: baseUrl + '?page=' + totalPages });
  }
  return links;
}

export function validate_email(email: any): any {
  if (!email || typeof email !== 'string') return false;
  var re: any = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validate_url(url: any): any {
  if (!url || typeof url !== 'string') return false;
  try { new URL(url); return true; } catch(e) { return false; }
}

export function clamp(value: any, min: any, max: any): any {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function randomInt(min: any, max: any): any {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function calculate_percentage(value: any, total: any): any {
  if (!total || total === 0) return 0;
  return Math.round((value / total) * 10000) / 100;
}

export function bytes_to_human(bytes: any): any {
  var units: any = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i: any = 0;
  var size: any = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return size.toFixed(2) + ' ' + units[i];
}

export function diff_objects(obj1: any, obj2: any): any {
  var changes: any = {};
  var allKeys: any = [...new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})])];
  for (var i = 0; i < allKeys.length; i++) {
    var key: any = allKeys[i];
    var val1: any = obj1 ? obj1[key] : undefined;
    var val2: any = obj2 ? obj2[key] : undefined;
    if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      changes[key] = { old: val1, new: val2 };
    }
  }
  return changes;
}

export function mask_sensitive(str: any, visibleChars: any): any {
  if (!str || typeof str !== 'string') return str;
  var visible: any = visibleChars || 4;
  if (str.length <= visible) return '*'.repeat(str.length);
  return '*'.repeat(str.length - visible) + str.slice(-visible);
}

export function create_error_response(message: any, code: any, details: any): any {
  return {
    success: false,
    error: {
      message: message,
      code: code || 'UNKNOWN_ERROR',
      details: details || null
    },
    timestamp: new Date().toISOString()
  };
}