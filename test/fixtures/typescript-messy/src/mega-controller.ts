import express from 'express';
import { doValidation, formatResponse, parse_request_data, transformData, CACHE, generate_id, Send_Email, log_action, checkPermission, sanitize } from './utils';
import { User, Product, Order, ApiResponse } from './types';

const app = express();
app.use(express.json());

var DB: any = null;
var REDIS_CLIENT: any = null;
var CONFIG: any = {
  db_host: 'localhost',
  db_port: 5432,
  db_name: 'messy_app',
  db_user: 'admin',
  db_password: 'admin123',
  redis_url: 'redis://localhost:6379',
  jwt_secret: 'mysecretkey',
  smtp_host: 'smtp.example.com',
  smtp_pass: 'smtppass',
  api_key: 'sk-1234567890',
  stripe_key: 'sk_test_abc123',
  aws_access_key: 'AKIA1234567890',
  aws_secret_key: 'secretkey1234567890',
};
let currentUser: any = null;
let requestQueue: any[] = [];
let error_log: any[] = [];
let stats_data: any = { requests: 0, errors: 0, last_request: null };
let temp_storage: any = {};

async function initDatabase() {
  try {
    DB = {
      query: async (sql: any, params: any) => {
        stats_data.requests++;
        stats_data.last_request = new Date();
        console.log('Query:', sql);
        return { rows: [], rowCount: 0 };
      },
      connect: async () => { console.log('Connected'); },
      end: async () => { console.log('Disconnected'); }
    };
    await DB.connect();
    console.log('Database initialized');
  } catch(e: any) {
    console.log('DB init failed:', e);
    error_log.push({ type: 'db_init', error: e, time: new Date() });
  }
}

async function initRedis() {
  try {
    REDIS_CLIENT = {
      get: async (key: any) => { return CACHE[key] || null; },
      set: async (key: any, value: any, ttl: any) => { CACHE[key] = value; },
      del: async (key: any) => { delete CACHE[key]; },
    };
  } catch(e: any) {
    console.log('Redis init failed');
    error_log.push({ type: 'redis_init', error: e, time: new Date() });
  }
}

function authenticate(req: any, res: any, next: any) {
  let token = req.headers['authorization'];
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  token = token.replace('Bearer ', '');
  try {
    const jwt = require('jsonwebtoken');
    var decoded: any = jwt.verify(token, CONFIG.jwt_secret);
    req.user = decoded;
    currentUser = decoded;
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/users', authenticate, async function(req: any, res: any) {
  try {
    var name = req.body.name;
    var email = req.body.email;
    var password = req.body.password;
    var role = req.body.role;
    var phone = req.body.phone;
    var address = req.body.address;
    var city = req.body.city;
    var state = req.body.state;
    var zip = req.body.zip;
    var country = req.body.country;
    var company = req.body.company;
    var department = req.body.department;
    var title = req.body.title;
    var bio = req.body.bio;
    var avatar_url = req.body.avatar_url;
    var preferences = req.body.preferences;
    var notification_settings = req.body.notification_settings;
    var two_factor_enabled = req.body.two_factor_enabled;
    var timezone = req.body.timezone;
    var locale = req.body.locale;

    if (!name) { res.status(400).json({ error: 'Name required' }); return; }
    if (!email) { res.status(400).json({ error: 'Email required' }); return; }
    if (!password) { res.status(400).json({ error: 'Password required' }); return; }
    if (password.length < 6) { res.status(400).json({ error: 'Password too short' }); return; }
    if (email.indexOf('@') === -1) { res.status(400).json({ error: 'Invalid email' }); return; }

    if (!checkPermission(req.user, 'create_user')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const existingUser: any = await DB.query("SELECT * FROM users WHERE email = '" + email + "'", []);
    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'User exists' });
      return;
    }

    const bcrypt = require('bcrypt');
    var hashedPassword: any = await bcrypt.hash(password, 10);

    var id: any = generate_id();
    var sql: any = `INSERT INTO users (id, name, email, password, role, phone, address, city, state, zip, country, company, department, title, bio, avatar_url, preferences, notification_settings, two_factor_enabled, timezone, locale, created_at, updated_at, is_active) VALUES ('${id}', '${name}', '${email}', '${hashedPassword}', '${role || 'user'}', '${phone || ''}', '${address || ''}', '${city || ''}', '${state || ''}', '${zip || ''}', '${country || ''}', '${company || ''}', '${department || ''}', '${title || ''}', '${bio || ''}', '${avatar_url || ''}', '${JSON.stringify(preferences || {})}', '${JSON.stringify(notification_settings || {})}', ${two_factor_enabled || false}, '${timezone || 'UTC'}', '${locale || 'en'}', NOW(), NOW(), true)`;

    await DB.query(sql, []);

    log_action('user_created', { id, email });

    if (CONFIG.smtp_host) {
      try {
        await Send_Email(email, 'Welcome!', 'Your account has been created.');
      } catch(e: any) {
        console.log('Failed to send welcome email:', e);
        error_log.push({ type: 'email', error: e.message, time: new Date() });
      }
    }

    await REDIS_CLIENT.del('users_list');
    await REDIS_CLIENT.del('users_count');

    res.status(201).json({
      success: true,
      data: { id, name, email, role: role || 'user' },
      message: 'User created'
    });
  } catch(e: any) {
    console.log('Error creating user:', e);
    error_log.push({ type: 'create_user', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users', authenticate, async function(req: any, res: any) {
  try {
    var page: any = parseInt(req.query.page) || 1;
    var limit: any = parseInt(req.query.limit) || 20;
    var search: any = req.query.search || '';
    var role_filter: any = req.query.role || '';
    var sort_by: any = req.query.sort_by || 'created_at';
    var sort_dir: any = req.query.sort_dir || 'DESC';
    var is_active: any = req.query.is_active;
    var date_from: any = req.query.date_from;
    var date_to: any = req.query.date_to;
    var department_filter: any = req.query.department;
    var company_filter: any = req.query.company;

    var cacheKey: any = `users_${page}_${limit}_${search}_${role_filter}_${sort_by}_${sort_dir}`;
    var cached: any = await REDIS_CLIENT.get(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    var offset: any = (page - 1) * limit;
    var conditions: any[] = [];

    if (search) {
      conditions.push(`(name ILIKE '%${search}%' OR email ILIKE '%${search}%' OR company ILIKE '%${search}%')`);
    }
    if (role_filter) {
      conditions.push(`role = '${role_filter}'`);
    }
    if (is_active !== undefined && is_active !== '') {
      conditions.push(`is_active = ${is_active === 'true'}`);
    }
    if (date_from) {
      conditions.push(`created_at >= '${date_from}'`);
    }
    if (date_to) {
      conditions.push(`created_at <= '${date_to}'`);
    }
    if (department_filter) {
      conditions.push(`department = '${department_filter}'`);
    }
    if (company_filter) {
      conditions.push(`company = '${company_filter}'`);
    }

    var whereClause: any = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    var countSql: any = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    var countResult: any = await DB.query(countSql, []);
    var total: any = countResult.rows[0]?.total || 0;

    var sql: any = `SELECT id, name, email, role, phone, company, department, title, is_active, created_at, updated_at, last_login FROM users ${whereClause} ORDER BY ${sort_by} ${sort_dir} LIMIT ${limit} OFFSET ${offset}`;
    var result: any = await DB.query(sql, []);

    var response: any = {
      success: true,
      data: result.rows,
      meta: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      }
    };

    await REDIS_CLIENT.set(cacheKey, JSON.stringify(response), 300);

    res.json(response);
  } catch(e: any) {
    console.log('Error listing users:', e);
    error_log.push({ type: 'list_users', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:id', authenticate, async function(req: any, res: any) {
  try {
    var userId: any = req.params.id;

    var cached: any = await REDIS_CLIENT.get(`user_${userId}`);
    if (cached) {
      res.json({ success: true, data: JSON.parse(cached) });
      return;
    }

    var sql: any = `SELECT * FROM users WHERE id = '${userId}'`;
    var result: any = await DB.query(sql, []);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    var user: any = result.rows[0];
    delete user.password;

    await REDIS_CLIENT.set(`user_${userId}`, JSON.stringify(user), 600);

    res.json({ success: true, data: user });
  } catch(e: any) {
    console.log('Error getting user:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/users/:id', authenticate, async function(req: any, res: any) {
  try {
    var userId: any = req.params.id;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    var fields: any[] = [];
    var allowedFields: any = ['name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'company', 'department', 'title', 'bio', 'avatar_url', 'preferences', 'notification_settings', 'timezone', 'locale'];
    for (var i = 0; i < allowedFields.length; i++) {
      if (req.body[allowedFields[i]] !== undefined) {
        var val: any = req.body[allowedFields[i]];
        if (typeof val === 'object') {
          fields.push(`${allowedFields[i]} = '${JSON.stringify(val)}'`);
        } else {
          fields.push(`${allowedFields[i]} = '${val}'`);
        }
      }
    }
    if (req.user.role === 'admin') {
      if (req.body.role !== undefined) fields.push(`role = '${req.body.role}'`);
      if (req.body.is_active !== undefined) fields.push(`is_active = ${req.body.is_active}`);
    }
    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    fields.push("updated_at = NOW()");
    var sql: any = `UPDATE users SET ${fields.join(', ')} WHERE id = '${userId}'`;
    var result: any = await DB.query(sql, []);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await REDIS_CLIENT.del(`user_${userId}`);
    await REDIS_CLIENT.del('users_list');
    log_action('user_updated', { userId });
    res.json({ success: true, message: 'User updated' });
  } catch(e: any) {
    console.log('Error updating user:', e);
    error_log.push({ type: 'update_user', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:id', authenticate, async function(req: any, res: any) {
  try {
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    var userId: any = req.params.id;
    var sql: any = `DELETE FROM users WHERE id = '${userId}'`;
    var result: any = await DB.query(sql, []);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await REDIS_CLIENT.del(`user_${userId}`);
    await REDIS_CLIENT.del('users_list');
    await REDIS_CLIENT.del('users_count');
    log_action('user_deleted', { userId });
    res.json({ success: true, message: 'User deleted' });
  } catch(e: any) {
    console.log('Error deleting user:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products', authenticate, async function(req: any, res: any) {
  try {
    if (!checkPermission(req.user, 'manage_products')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    var title: any = req.body.title;
    var description: any = req.body.description;
    var price: any = req.body.price;
    var category: any = req.body.category;
    var subcategory: any = req.body.subcategory;
    var tags: any = req.body.tags;
    var sku: any = req.body.sku;
    var barcode: any = req.body.barcode;
    var weight: any = req.body.weight;
    var dimensions: any = req.body.dimensions;
    var images: any = req.body.images;
    var inventory_count: any = req.body.inventory_count;
    var low_stock_threshold: any = req.body.low_stock_threshold;
    var is_featured: any = req.body.is_featured;
    var is_published: any = req.body.is_published;
    var seo_title: any = req.body.seo_title;
    var seo_description: any = req.body.seo_description;
    var metadata: any = req.body.metadata;
    var variants: any = req.body.variants;

    if (!title) { res.status(400).json({ error: 'Title required' }); return; }
    if (!price || price <= 0) { res.status(400).json({ error: 'Valid price required' }); return; }
    if (!category) { res.status(400).json({ error: 'Category required' }); return; }

    var id: any = generate_id();
    var sql: any = `INSERT INTO products (id, title, description, price, category, subcategory, tags, sku, barcode, weight, dimensions, images, inventory_count, low_stock_threshold, is_featured, is_published, seo_title, seo_description, metadata, created_at, updated_at) VALUES ('${id}', '${sanitize(title)}', '${sanitize(description || '')}', ${price}, '${category}', '${subcategory || ''}', '${JSON.stringify(tags || [])}', '${sku || ''}', '${barcode || ''}', ${weight || 0}, '${JSON.stringify(dimensions || {})}', '${JSON.stringify(images || [])}', ${inventory_count || 0}, ${low_stock_threshold || 5}, ${is_featured || false}, ${is_published !== false}, '${seo_title || title}', '${seo_description || ''}', '${JSON.stringify(metadata || {})}', NOW(), NOW())`;

    await DB.query(sql, []);

    if (variants && variants.length > 0) {
      for (var i = 0; i < variants.length; i++) {
        var variant: any = variants[i];
        var variantId: any = generate_id();
        var variantSql: any = `INSERT INTO product_variants (id, product_id, name, sku, price_modifier, inventory_count, attributes, created_at) VALUES ('${variantId}', '${id}', '${variant.name}', '${variant.sku || ''}', ${variant.price_modifier || 0}, ${variant.inventory_count || 0}, '${JSON.stringify(variant.attributes || {})}', NOW())`;
        await DB.query(variantSql, []);
      }
    }

    await REDIS_CLIENT.del('products_list');
    log_action('product_created', { id, title });

    res.status(201).json({ success: true, data: { id, title, price, category } });
  } catch(e: any) {
    console.log('Error creating product:', e);
    error_log.push({ type: 'create_product', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products', async function(req: any, res: any) {
  try {
    var page: any = parseInt(req.query.page) || 1;
    var limit: any = parseInt(req.query.limit) || 20;
    var category: any = req.query.category;
    var subcategory: any = req.query.subcategory;
    var min_price: any = req.query.min_price;
    var max_price: any = req.query.max_price;
    var search: any = req.query.search;
    var sort_by: any = req.query.sort_by || 'created_at';
    var sort_dir: any = req.query.sort_dir || 'DESC';
    var in_stock: any = req.query.in_stock;
    var is_featured: any = req.query.is_featured;
    var tags_filter: any = req.query.tags;

    var offset: any = (page - 1) * limit;
    var conditions: any[] = ["is_published = true"];

    if (category) conditions.push(`category = '${category}'`);
    if (subcategory) conditions.push(`subcategory = '${subcategory}'`);
    if (min_price) conditions.push(`price >= ${min_price}`);
    if (max_price) conditions.push(`price <= ${max_price}`);
    if (search) conditions.push(`(title ILIKE '%${search}%' OR description ILIKE '%${search}%')`);
    if (in_stock === 'true') conditions.push('inventory_count > 0');
    if (is_featured === 'true') conditions.push('is_featured = true');
    if (tags_filter) {
      var tagsArray: any = tags_filter.split(',');
      for (var t = 0; t < tagsArray.length; t++) {
        conditions.push(`tags @> '["${tagsArray[t].trim()}"]'`);
      }
    }

    var whereClause: any = 'WHERE ' + conditions.join(' AND ');
    var countSql: any = `SELECT COUNT(*) as total FROM products ${whereClause}`;
    var countResult: any = await DB.query(countSql, []);
    var total: any = countResult.rows[0]?.total || 0;

    var sql: any = `SELECT id, title, description, price, category, subcategory, tags, images, inventory_count, is_featured, created_at FROM products ${whereClause} ORDER BY ${sort_by} ${sort_dir} LIMIT ${limit} OFFSET ${offset}`;
    var result: any = await DB.query(sql, []);

    res.json({
      success: true,
      data: result.rows,
      meta: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch(e: any) {
    console.log('Error listing products:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', async function(req: any, res: any) {
  try {
    var productId: any = req.params.id;
    var cached: any = await REDIS_CLIENT.get(`product_${productId}`);
    if (cached) {
      res.json({ success: true, data: JSON.parse(cached) });
      return;
    }
    var sql: any = `SELECT * FROM products WHERE id = '${productId}'`;
    var result: any = await DB.query(sql, []);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    var product: any = result.rows[0];
    var variantsSql: any = `SELECT * FROM product_variants WHERE product_id = '${productId}'`;
    var variantsResult: any = await DB.query(variantsSql, []);
    product.variants = variantsResult.rows;
    var reviewsSql: any = `SELECT r.*, u.name as reviewer_name FROM product_reviews r JOIN users u ON r.user_id = u.id WHERE r.product_id = '${productId}' ORDER BY r.created_at DESC LIMIT 10`;
    var reviewsResult: any = await DB.query(reviewsSql, []);
    product.reviews = reviewsResult.rows;
    var avgRatingSql: any = `SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM product_reviews WHERE product_id = '${productId}'`;
    var avgResult: any = await DB.query(avgRatingSql, []);
    product.avg_rating = avgResult.rows[0]?.avg_rating || 0;
    product.review_count = avgResult.rows[0]?.review_count || 0;
    await REDIS_CLIENT.set(`product_${productId}`, JSON.stringify(product), 600);
    res.json({ success: true, data: product });
  } catch(e: any) {
    console.log('Error getting product:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/orders', authenticate, async function(req: any, res: any) {
  try {
    var userId: any = req.user.id;
    var items: any = req.body.items;
    var shipping_address: any = req.body.shipping_address;
    var billing_address: any = req.body.billing_address;
    var payment_method: any = req.body.payment_method;
    var coupon_code: any = req.body.coupon_code;
    var notes: any = req.body.notes;
    var gift_wrap: any = req.body.gift_wrap;
    var gift_message: any = req.body.gift_message;
    var expedited_shipping: any = req.body.expedited_shipping;

    if (!items || items.length === 0) {
      res.status(400).json({ error: 'Items required' });
      return;
    }
    if (!shipping_address) {
      res.status(400).json({ error: 'Shipping address required' });
      return;
    }
    if (!payment_method) {
      res.status(400).json({ error: 'Payment method required' });
      return;
    }

    var productIds: any = items.map((i: any) => `'${i.product_id}'`).join(',');
    var productsSql: any = `SELECT * FROM products WHERE id IN (${productIds})`;
    var productsResult: any = await DB.query(productsSql, []);
    var products: any = productsResult.rows;

    var subtotal: any = 0;
    var order_items: any[] = [];

    for (var i = 0; i < items.length; i++) {
      var item: any = items[i];
      var product: any = null;
      for (var j = 0; j < products.length; j++) {
        if (products[j].id === item.product_id) {
          product = products[j];
          break;
        }
      }
      if (!product) {
        res.status(400).json({ error: `Product not found: ${item.product_id}` });
        return;
      }
      if (product.inventory_count < item.quantity) {
        res.status(400).json({ error: `Insufficient stock for ${product.title}` });
        return;
      }
      var item_price: any = product.price;
      if (item.variant_id) {
        var variantSql: any = `SELECT * FROM product_variants WHERE id = '${item.variant_id}'`;
        var variantResult: any = await DB.query(variantSql, []);
        if (variantResult.rows.length > 0) {
          item_price += variantResult.rows[0].price_modifier;
        }
      }
      var item_total: any = item_price * item.quantity;
      subtotal += item_total;
      order_items.push({ product_id: item.product_id, variant_id: item.variant_id, quantity: item.quantity, unit_price: item_price, total: item_total });
    }

    var discount: any = 0;
    if (coupon_code) {
      var couponSql: any = `SELECT * FROM coupons WHERE code = '${coupon_code}' AND is_active = true AND expires_at > NOW()`;
      var couponResult: any = await DB.query(couponSql, []);
      if (couponResult.rows.length > 0) {
        var coupon: any = couponResult.rows[0];
        if (coupon.type === 'percentage') {
          discount = subtotal * (coupon.value / 100);
        } else if (coupon.type === 'fixed') {
          discount = coupon.value;
        }
        if (coupon.max_discount && discount > coupon.max_discount) {
          discount = coupon.max_discount;
        }
      }
    }

    var tax_rate: any = 0.08;
    var taxable_amount: any = subtotal - discount;
    var tax: any = taxable_amount * tax_rate;
    var shipping_cost: any = expedited_shipping ? 24.99 : (subtotal > 100 ? 0 : 9.99);
    if (gift_wrap) shipping_cost += 4.99;
    var grand_total: any = taxable_amount + tax + shipping_cost;

    var orderId: any = generate_id();
    var orderSql: any = `INSERT INTO orders (id, user_id, subtotal, discount, tax, shipping_cost, total, status, shipping_address, billing_address, payment_method, coupon_code, notes, gift_wrap, gift_message, expedited_shipping, created_at, updated_at) VALUES ('${orderId}', '${userId}', ${subtotal}, ${discount}, ${tax}, ${shipping_cost}, ${grand_total}, 'pending', '${JSON.stringify(shipping_address)}', '${JSON.stringify(billing_address || shipping_address)}', '${payment_method}', '${coupon_code || ''}', '${notes || ''}', ${gift_wrap || false}, '${gift_message || ''}', ${expedited_shipping || false}, NOW(), NOW())`;

    await DB.query(orderSql, []);

    for (var k = 0; k < order_items.length; k++) {
      var oi: any = order_items[k];
      var oiSql: any = `INSERT INTO order_items (id, order_id, product_id, variant_id, quantity, unit_price, total, created_at) VALUES ('${generate_id()}', '${orderId}', '${oi.product_id}', '${oi.variant_id || ''}', ${oi.quantity}, ${oi.unit_price}, ${oi.total}, NOW())`;
      await DB.query(oiSql, []);
      var stockSql: any = `UPDATE products SET inventory_count = inventory_count - ${oi.quantity} WHERE id = '${oi.product_id}'`;
      await DB.query(stockSql, []);
    }

    if (coupon_code && discount > 0) {
      await DB.query(`UPDATE coupons SET usage_count = usage_count + 1 WHERE code = '${coupon_code}'`, []);
    }

    try {
      await Send_Email(req.user.email, 'Order Confirmation', `Your order ${orderId} has been placed. Total: $${grand_total.toFixed(2)}`);
    } catch(emailErr: any) {
      console.log('Failed to send order confirmation email');
      error_log.push({ type: 'order_email', error: emailErr.message, orderId });
    }

    await REDIS_CLIENT.del('products_list');
    log_action('order_created', { orderId, userId, total: grand_total });

    res.status(201).json({
      success: true,
      data: { id: orderId, subtotal, discount, tax, shipping_cost, total: grand_total, status: 'pending', items: order_items }
    });
  } catch(e: any) {
    console.log('Error creating order:', e);
    error_log.push({ type: 'create_order', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/orders', authenticate, async function(req: any, res: any) {
  try {
    var page: any = parseInt(req.query.page) || 1;
    var limit: any = parseInt(req.query.limit) || 20;
    var status_filter: any = req.query.status;
    var sort_by: any = req.query.sort_by || 'created_at';
    var sort_dir: any = req.query.sort_dir || 'DESC';
    var offset: any = (page - 1) * limit;
    var conditions: any[] = [];
    if (req.user.role !== 'admin') {
      conditions.push(`user_id = '${req.user.id}'`);
    }
    if (status_filter) {
      conditions.push(`status = '${status_filter}'`);
    }
    var whereClause: any = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    var sql: any = `SELECT o.*, u.name as user_name, u.email as user_email FROM orders o JOIN users u ON o.user_id = u.id ${whereClause} ORDER BY o.${sort_by} ${sort_dir} LIMIT ${limit} OFFSET ${offset}`;
    var result: any = await DB.query(sql, []);
    var countSql: any = `SELECT COUNT(*) as total FROM orders ${whereClause}`;
    var countResult: any = await DB.query(countSql, []);
    var total: any = countResult.rows[0]?.total || 0;
    res.json({ success: true, data: result.rows, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch(e: any) {
    console.log('Error listing orders:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/dashboard', authenticate, async function(req: any, res: any) {
  try {
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }

    var dashboard: any = {};

    var usersCount: any = await DB.query("SELECT COUNT(*) as total FROM users WHERE is_active = true", []);
    dashboard.total_users = usersCount.rows[0]?.total || 0;

    var newUsers: any = await DB.query("SELECT COUNT(*) as total FROM users WHERE created_at > NOW() - INTERVAL '30 days'", []);
    dashboard.new_users_30d = newUsers.rows[0]?.total || 0;

    var ordersCount: any = await DB.query("SELECT COUNT(*) as total FROM orders", []);
    dashboard.total_orders = ordersCount.rows[0]?.total || 0;

    var revenue: any = await DB.query("SELECT SUM(total) as sum FROM orders WHERE status != 'cancelled'", []);
    dashboard.total_revenue = revenue.rows[0]?.sum || 0;

    var monthlyRevenue: any = await DB.query("SELECT SUM(total) as sum FROM orders WHERE status != 'cancelled' AND created_at > NOW() - INTERVAL '30 days'", []);
    dashboard.revenue_30d = monthlyRevenue.rows[0]?.sum || 0;

    var productsCount: any = await DB.query("SELECT COUNT(*) as total FROM products WHERE is_published = true", []);
    dashboard.total_products = productsCount.rows[0]?.total || 0;

    var lowStock: any = await DB.query("SELECT COUNT(*) as total FROM products WHERE inventory_count <= low_stock_threshold AND is_published = true", []);
    dashboard.low_stock_count = lowStock.rows[0]?.total || 0;

    var pendingOrders: any = await DB.query("SELECT COUNT(*) as total FROM orders WHERE status = 'pending'", []);
    dashboard.pending_orders = pendingOrders.rows[0]?.total || 0;

    var topProducts: any = await DB.query("SELECT p.id, p.title, SUM(oi.quantity) as total_sold, SUM(oi.total) as total_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id GROUP BY p.id, p.title ORDER BY total_sold DESC LIMIT 10", []);
    dashboard.top_products = topProducts.rows;

    var recentOrders: any = await DB.query("SELECT o.id, o.total, o.status, o.created_at, u.name as user_name FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 10", []);
    dashboard.recent_orders = recentOrders.rows;

    var salesByCategory: any = await DB.query("SELECT p.category, SUM(oi.total) as revenue, COUNT(DISTINCT o.id) as order_count FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id WHERE o.status != 'cancelled' GROUP BY p.category ORDER BY revenue DESC", []);
    dashboard.sales_by_category = salesByCategory.rows;

    dashboard.server_stats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      total_requests: stats_data.requests,
      total_errors: error_log.length,
      cache_entries: Object.keys(CACHE).length
    };

    res.json({ success: true, data: dashboard });
  } catch(e: any) {
    console.log('Error loading dashboard:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products/:id/reviews', authenticate, async function(req: any, res: any) {
  try {
    var productId: any = req.params.id;
    var rating: any = req.body.rating;
    var comment: any = req.body.comment;
    var title: any = req.body.title;
    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Rating must be 1-5' });
      return;
    }
    var existingReview: any = await DB.query(`SELECT id FROM product_reviews WHERE product_id = '${productId}' AND user_id = '${req.user.id}'`, []);
    if (existingReview.rows.length > 0) {
      res.status(409).json({ error: 'Already reviewed' });
      return;
    }
    var id: any = generate_id();
    var sql: any = `INSERT INTO product_reviews (id, product_id, user_id, rating, title, comment, created_at) VALUES ('${id}', '${productId}', '${req.user.id}', ${rating}, '${title || ''}', '${comment || ''}', NOW())`;
    await DB.query(sql, []);
    await REDIS_CLIENT.del(`product_${productId}`);
    res.status(201).json({ success: true, data: { id, rating, title, comment } });
  } catch(e: any) {
    console.log('Error creating review:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/reports/sales', authenticate, async function(req: any, res: any) {
  try {
    if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
    var period: any = req.query.period || 'daily';
    var start_date: any = req.query.start_date || '2024-01-01';
    var end_date: any = req.query.end_date || '2025-12-31';
    var groupBy: any = period === 'monthly' ? "DATE_TRUNC('month', created_at)" : period === 'weekly' ? "DATE_TRUNC('week', created_at)" : "DATE(created_at)";
    var sql: any = `SELECT ${groupBy} as period, COUNT(*) as order_count, SUM(total) as revenue, SUM(discount) as total_discounts, AVG(total) as avg_order_value FROM orders WHERE created_at BETWEEN '${start_date}' AND '${end_date}' AND status != 'cancelled' GROUP BY ${groupBy} ORDER BY period`;
    var result: any = await DB.query(sql, []);
    var total_revenue: any = 0;
    var total_orders: any = 0;
    var total_discounts: any = 0;
    for (var i = 0; i < result.rows.length; i++) {
      total_revenue += parseFloat(result.rows[i].revenue) || 0;
      total_orders += parseInt(result.rows[i].order_count) || 0;
      total_discounts += parseFloat(result.rows[i].total_discounts) || 0;
    }
    res.json({
      success: true,
      data: result.rows,
      summary: { total_revenue, total_orders, total_discounts, avg_order_value: total_orders > 0 ? total_revenue / total_orders : 0, period, start_date, end_date }
    });
  } catch(e: any) {
    console.log('Error generating sales report:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', async function(req: any, res: any) {
  try {
    await DB.query('SELECT 1', []);
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      stats: stats_data,
      errors: error_log.length,
      cache_size: Object.keys(CACHE).length
    });
  } catch(e: any) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

app.put('/api/orders/:id/status', authenticate, async function(req: any, res: any) {
  try {
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    var orderId: any = req.params.id;
    var new_status: any = req.body.status;
    var tracking_number: any = req.body.tracking_number;
    var internal_notes: any = req.body.internal_notes;

    var valid_statuses: any = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'on_hold'];
    if (!new_status || valid_statuses.indexOf(new_status) === -1) {
      res.status(400).json({ error: 'Invalid status. Allowed: ' + valid_statuses.join(', ') });
      return;
    }

    var currentOrder: any = await DB.query(`SELECT * FROM orders WHERE id = '${orderId}'`, []);
    if (currentOrder.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    var order: any = currentOrder.rows[0];
    var old_status: any = order.status;

    if (old_status === 'delivered' && new_status !== 'refunded') {
      res.status(400).json({ error: 'Delivered orders can only be refunded' });
      return;
    }
    if (old_status === 'cancelled') {
      res.status(400).json({ error: 'Cannot change status of cancelled order' });
      return;
    }

    var updateFields: any = [`status = '${new_status}'`, "updated_at = NOW()"];
    if (tracking_number) updateFields.push(`tracking_number = '${tracking_number}'`);
    if (internal_notes) updateFields.push(`internal_notes = '${internal_notes}'`);

    var sql: any = `UPDATE orders SET ${updateFields.join(', ')} WHERE id = '${orderId}'`;
    await DB.query(sql, []);

    await DB.query(`INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, notes, created_at) VALUES ('${generate_id()}', '${orderId}', '${old_status}', '${new_status}', '${req.user.id}', '${internal_notes || ''}', NOW())`, []);

    if (new_status === 'cancelled') {
      var orderItems: any = await DB.query(`SELECT * FROM order_items WHERE order_id = '${orderId}'`, []);
      for (var i = 0; i < orderItems.rows.length; i++) {
        var oi: any = orderItems.rows[i];
        await DB.query(`UPDATE products SET inventory_count = inventory_count + ${oi.quantity} WHERE id = '${oi.product_id}'`, []);
      }
    }

    if (new_status === 'refunded') {
      await DB.query(`INSERT INTO refunds (id, order_id, amount, reason, status, processed_by, created_at) VALUES ('${generate_id()}', '${orderId}', ${order.total}, '${internal_notes || 'Status change to refunded'}', 'processed', '${req.user.id}', NOW())`, []);
    }

    var userInfo: any = await DB.query(`SELECT email, name FROM users WHERE id = '${order.user_id}'`, []);
    if (userInfo.rows.length > 0) {
      try {
        var subject: any = `Order ${orderId} - Status Update`;
        var body: any = `Hi ${userInfo.rows[0].name}, your order status has been updated to: ${new_status}.`;
        if (tracking_number && new_status === 'shipped') {
          body += ` Tracking number: ${tracking_number}`;
        }
        await Send_Email(userInfo.rows[0].email, subject, body);
      } catch(emailErr: any) {
        console.log('Failed to send status update email');
        error_log.push({ type: 'order_status_email', error: emailErr.message, orderId });
      }
    }

    log_action('order_status_changed', { orderId, old_status, new_status, changed_by: req.user.id });

    res.json({ success: true, message: 'Order status updated', data: { orderId, old_status, new_status } });
  } catch(e: any) {
    console.log('Error updating order status:', e);
    error_log.push({ type: 'update_order_status', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/bulk/products', authenticate, async function(req: any, res: any) {
  try {
    if (!checkPermission(req.user, 'manage_products')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    var products_data: any = req.body.products;
    if (!products_data || !Array.isArray(products_data) || products_data.length === 0) {
      res.status(400).json({ error: 'Products array required' });
      return;
    }
    if (products_data.length > 100) {
      res.status(400).json({ error: 'Maximum 100 products per batch' });
      return;
    }
    var results: any = { created: 0, failed: 0, errors: [] };
    for (var idx = 0; idx < products_data.length; idx++) {
      var p: any = products_data[idx];
      try {
        if (!p.title || !p.price || p.price <= 0 || !p.category) {
          results.failed++;
          results.errors.push({ index: idx, error: 'Missing required fields (title, price, category)' });
          continue;
        }
        var id: any = generate_id();
        var sql: any = `INSERT INTO products (id, title, description, price, category, tags, inventory_count, is_published, created_at, updated_at) VALUES ('${id}', '${sanitize(p.title)}', '${sanitize(p.description || '')}', ${p.price}, '${p.category}', '${JSON.stringify(p.tags || [])}', ${p.inventory_count || 0}, ${p.is_published !== false}, NOW(), NOW())`;
        await DB.query(sql, []);
        results.created++;
      } catch(batchErr: any) {
        results.failed++;
        results.errors.push({ index: idx, error: batchErr.message });
      }
    }
    await REDIS_CLIENT.del('products_list');
    log_action('bulk_products_created', { created: results.created, failed: results.failed });
    res.json({ success: true, data: results });
  } catch(e: any) {
    console.log('Error bulk creating products:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/:id/avatar', authenticate, async function(req: any, res: any) {
  try {
    var userId: any = req.params.id;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    var file: any = req.body.file;
    var filename: any = req.body.filename;
    var mimetype: any = req.body.mimetype;
    if (!file) {
      res.status(400).json({ error: 'File data required' });
      return;
    }
    var allowed_types: any = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (mimetype && allowed_types.indexOf(mimetype) === -1) {
      res.status(400).json({ error: 'Invalid file type. Allowed: ' + allowed_types.join(', ') });
      return;
    }
    var avatar_id: any = generate_id();
    var ext: any = filename ? filename.split('.').pop() : 'jpg';
    var avatar_path: any = `avatars/${userId}/${avatar_id}.${ext}`;
    temp_storage[avatar_path] = file;
    var sql: any = `UPDATE users SET avatar_url = '${avatar_path}', updated_at = NOW() WHERE id = '${userId}'`;
    await DB.query(sql, []);
    await REDIS_CLIENT.del(`user_${userId}`);
    log_action('avatar_uploaded', { userId, path: avatar_path });
    res.json({ success: true, data: { avatar_url: avatar_path } });
  } catch(e: any) {
    console.log('Error uploading avatar:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async function(req: any, res: any) {
  try {
    var email: any = req.body.email;
    var password: any = req.body.password;
    var remember_me: any = req.body.remember_me;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }
    var sql: any = `SELECT * FROM users WHERE email = '${email}' AND is_active = true`;
    var result: any = await DB.query(sql, []);
    if (result.rows.length === 0) {
      log_action('login_failed', { email, reason: 'user_not_found' });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    var user: any = result.rows[0];
    const bcrypt = require('bcrypt');
    var passwordMatch: any = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await DB.query(`UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = '${user.id}'`, []);
      log_action('login_failed', { email, reason: 'wrong_password' });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (user.failed_login_attempts > 5) {
      log_action('login_blocked', { email, reason: 'too_many_attempts' });
      res.status(423).json({ error: 'Account locked. Contact support.' });
      return;
    }
    const jwt = require('jsonwebtoken');
    var token_expiry: any = remember_me ? '30d' : '24h';
    var token: any = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, CONFIG.jwt_secret, { expiresIn: token_expiry });
    await DB.query(`UPDATE users SET last_login = NOW(), failed_login_attempts = 0 WHERE id = '${user.id}'`, []);
    log_action('login_success', { userId: user.id, email });
    res.json({
      success: true,
      data: {
        token: token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        expires_in: remember_me ? '30 days' : '24 hours'
      }
    });
  } catch(e: any) {
    console.log('Error during login:', e);
    error_log.push({ type: 'login', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async function(req: any, res: any) {
  try {
    var name: any = req.body.name;
    var email: any = req.body.email;
    var password: any = req.body.password;
    var confirm_password: any = req.body.confirm_password;
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password required' });
      return;
    }
    if (password !== confirm_password) {
      res.status(400).json({ error: 'Passwords do not match' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (email.indexOf('@') === -1 || email.indexOf('.') === -1) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }
    var existing: any = await DB.query(`SELECT id FROM users WHERE email = '${email}'`, []);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    const bcrypt = require('bcrypt');
    var hashedPassword: any = await bcrypt.hash(password, 12);
    var id: any = generate_id();
    var sql: any = `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at) VALUES ('${id}', '${sanitize(name)}', '${sanitize(email)}', '${hashedPassword}', 'user', true, NOW(), NOW())`;
    await DB.query(sql, []);
    const jwt_mod = require('jsonwebtoken');
    var token: any = jwt_mod.sign({ id, email, role: 'user', name }, CONFIG.jwt_secret, { expiresIn: '24h' });
    try {
      await Send_Email(email, 'Welcome to Our Platform', `Hi ${name}, thanks for signing up! Please verify your email.`);
    } catch(mailErr: any) {
      console.log('Registration email failed:', mailErr);
    }
    log_action('user_registered', { id, email });
    res.status(201).json({
      success: true,
      data: { token, user: { id, name, email, role: 'user' } }
    });
  } catch(e: any) {
    console.log('Error during registration:', e);
    error_log.push({ type: 'register', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/forgot-password', async function(req: any, res: any) {
  try {
    var email: any = req.body.email;
    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }
    var result: any = await DB.query(`SELECT id, name FROM users WHERE email = '${email}' AND is_active = true`, []);
    if (result.rows.length === 0) {
      res.json({ success: true, message: 'If account exists, a reset email was sent' });
      return;
    }
    var user: any = result.rows[0];
    var reset_token: any = generate_id() + generate_id();
    var expires: any = new Date(Date.now() + 3600000).toISOString();
    await DB.query(`UPDATE users SET reset_token = '${reset_token}', reset_token_expires = '${expires}' WHERE id = '${user.id}'`, []);
    try {
      await Send_Email(email, 'Password Reset', `Hi ${user.name}, use this link to reset your password: https://example.com/reset?token=${reset_token}`);
    } catch(mailErr: any) {
      console.log('Reset email failed:', mailErr);
    }
    log_action('password_reset_requested', { userId: user.id });
    res.json({ success: true, message: 'If account exists, a reset email was sent' });
  } catch(e: any) {
    console.log('Error forgot password:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/reports/users', authenticate, async function(req: any, res: any) {
  try {
    if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
    var period: any = req.query.period || 'daily';
    var start_date: any = req.query.start_date || '2024-01-01';
    var end_date: any = req.query.end_date || '2025-12-31';
    var groupBy: any = period === 'monthly' ? "DATE_TRUNC('month', created_at)" : "DATE(created_at)";
    var signupsSql: any = `SELECT ${groupBy} as period, COUNT(*) as signups FROM users WHERE created_at BETWEEN '${start_date}' AND '${end_date}' GROUP BY ${groupBy} ORDER BY period`;
    var signupsResult: any = await DB.query(signupsSql, []);
    var roleDistribution: any = await DB.query("SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY count DESC", []);
    var activeVsInactive: any = await DB.query("SELECT is_active, COUNT(*) as count FROM users GROUP BY is_active", []);
    var topDepartments: any = await DB.query("SELECT department, COUNT(*) as count FROM users WHERE department IS NOT NULL AND department != '' GROUP BY department ORDER BY count DESC LIMIT 10", []);
    res.json({
      success: true,
      data: {
        signups_over_time: signupsResult.rows,
        role_distribution: roleDistribution.rows,
        active_vs_inactive: activeVsInactive.rows,
        top_departments: topDepartments.rows
      }
    });
  } catch(e: any) {
    console.log('Error generating user report:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/notifications/send', authenticate, async function(req: any, res: any) {
  try {
    if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
    var recipient_ids: any = req.body.recipient_ids;
    var subject: any = req.body.subject;
    var message_body: any = req.body.message;
    var channel: any = req.body.channel || 'email';
    if (!recipient_ids || !Array.isArray(recipient_ids) || recipient_ids.length === 0) {
      res.status(400).json({ error: 'Recipient IDs required' });
      return;
    }
    if (!subject || !message_body) {
      res.status(400).json({ error: 'Subject and message required' });
      return;
    }
    var sent_count: any = 0;
    var fail_count: any = 0;
    for (var n = 0; n < recipient_ids.length; n++) {
      try {
        var userResult: any = await DB.query(`SELECT email, name, notification_settings FROM users WHERE id = '${recipient_ids[n]}'`, []);
        if (userResult.rows.length === 0) {
          fail_count++;
          continue;
        }
        var recipient: any = userResult.rows[0];
        var notif_id: any = generate_id();
        await DB.query(`INSERT INTO notifications (id, user_id, type, subject, message, channel, is_read, created_at) VALUES ('${notif_id}', '${recipient_ids[n]}', 'admin_message', '${subject}', '${message_body}', '${channel}', false, NOW())`, []);
        if (channel === 'email' || channel === 'both') {
          await Send_Email(recipient.email, subject, message_body);
        }
        sent_count++;
      } catch(sendErr: any) {
        fail_count++;
        console.log('Notification send failed for user:', recipient_ids[n], sendErr);
      }
    }
    log_action('notifications_sent', { sent: sent_count, failed: fail_count, by: req.user.id });
    res.json({ success: true, data: { sent: sent_count, failed: fail_count, total: recipient_ids.length } });
  } catch(e: any) {
    console.log('Error sending notifications:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/search', async function(req: any, res: any) {
  try {
    var query: any = req.query.q;
    var type: any = req.query.type || 'all';
    var page: any = parseInt(req.query.page) || 1;
    var limit: any = parseInt(req.query.limit) || 20;
    var offset: any = (page - 1) * limit;
    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }
    var sanitized_query: any = sanitize(query);
    var search_results: any = { products: [], users: [], orders: [] };
    if (type === 'all' || type === 'products') {
      var productsSql: any = `SELECT id, title, description, price, category, images FROM products WHERE is_published = true AND (title ILIKE '%${sanitized_query}%' OR description ILIKE '%${sanitized_query}%' OR category ILIKE '%${sanitized_query}%') ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      var productsResult: any = await DB.query(productsSql, []);
      search_results.products = productsResult.rows;
    }
    if (type === 'all' || type === 'users') {
      if (currentUser && currentUser.role === 'admin') {
        var usersSql: any = `SELECT id, name, email, role, company FROM users WHERE (name ILIKE '%${sanitized_query}%' OR email ILIKE '%${sanitized_query}%' OR company ILIKE '%${sanitized_query}%') ORDER BY name LIMIT ${limit} OFFSET ${offset}`;
        var usersResult: any = await DB.query(usersSql, []);
        search_results.users = usersResult.rows;
      }
    }
    res.json({ success: true, data: search_results, meta: { query: sanitized_query, type, page, limit } });
  } catch(e: any) {
    console.log('Error performing search:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/audit-log', authenticate, async function(req: any, res: any) {
  try {
    if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
    var page: any = parseInt(req.query.page) || 1;
    var limit: any = parseInt(req.query.limit) || 50;
    var action_filter: any = req.query.action;
    var user_filter: any = req.query.user_id;
    var date_from: any = req.query.date_from;
    var date_to: any = req.query.date_to;
    var offset: any = (page - 1) * limit;
    var conditions: any[] = [];
    if (action_filter) conditions.push(`action = '${action_filter}'`);
    if (user_filter) conditions.push(`user_id = '${user_filter}'`);
    if (date_from) conditions.push(`created_at >= '${date_from}'`);
    if (date_to) conditions.push(`created_at <= '${date_to}'`);
    var whereClause: any = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    var sql: any = `SELECT al.*, u.name as user_name, u.email as user_email FROM audit_log al LEFT JOIN users u ON al.user_id = u.id ${whereClause} ORDER BY al.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    var result: any = await DB.query(sql, []);
    var countSql: any = `SELECT COUNT(*) as total FROM audit_log ${whereClause}`;
    var countResult: any = await DB.query(countSql, []);
    var total: any = countResult.rows[0]?.total || 0;
    res.json({ success: true, data: result.rows, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch(e: any) {
    console.log('Error fetching audit log:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/products/:id', authenticate, async function(req: any, res: any) {
  try {
    if (!checkPermission(req.user, 'manage_products')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    var productId: any = req.params.id;
    var fields: any[] = [];
    var allowedFields: any = ['title', 'description', 'price', 'category', 'subcategory', 'tags', 'sku', 'barcode', 'weight', 'dimensions', 'images', 'inventory_count', 'low_stock_threshold', 'is_featured', 'is_published', 'seo_title', 'seo_description', 'metadata'];
    for (var i = 0; i < allowedFields.length; i++) {
      if (req.body[allowedFields[i]] !== undefined) {
        var val: any = req.body[allowedFields[i]];
        if (typeof val === 'object') {
          fields.push(`${allowedFields[i]} = '${JSON.stringify(val)}'`);
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          fields.push(`${allowedFields[i]} = ${val}`);
        } else {
          fields.push(`${allowedFields[i]} = '${sanitize(String(val))}'`);
        }
      }
    }
    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    fields.push("updated_at = NOW()");
    var sql: any = `UPDATE products SET ${fields.join(', ')} WHERE id = '${productId}'`;
    var result: any = await DB.query(sql, []);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    await REDIS_CLIENT.del(`product_${productId}`);
    await REDIS_CLIENT.del('products_list');
    log_action('product_updated', { productId });
    res.json({ success: true, message: 'Product updated' });
  } catch(e: any) {
    console.log('Error updating product:', e);
    error_log.push({ type: 'update_product', error: e.message, time: new Date() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/products/:id', authenticate, async function(req: any, res: any) {
  try {
    if (!checkPermission(req.user, 'manage_products')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    var productId: any = req.params.id;
    var orderCheck: any = await DB.query(`SELECT COUNT(*) as count FROM order_items WHERE product_id = '${productId}'`, []);
    if (parseInt(orderCheck.rows[0]?.count) > 0) {
      var sql: any = `UPDATE products SET is_published = false, updated_at = NOW() WHERE id = '${productId}'`;
      await DB.query(sql, []);
      res.json({ success: true, message: 'Product unpublished (has order history)' });
    } else {
      await DB.query(`DELETE FROM product_variants WHERE product_id = '${productId}'`, []);
      await DB.query(`DELETE FROM product_reviews WHERE product_id = '${productId}'`, []);
      await DB.query(`DELETE FROM products WHERE id = '${productId}'`, []);
      res.json({ success: true, message: 'Product deleted' });
    }
    await REDIS_CLIENT.del(`product_${productId}`);
    await REDIS_CLIENT.del('products_list');
    log_action('product_removed', { productId });
  } catch(e: any) {
    console.log('Error deleting product:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/export/:entity', authenticate, async function(req: any, res: any) {
  try {
    if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
    var entity: any = req.params.entity;
    var format: any = req.query.format || 'json';
    var date_from: any = req.query.date_from;
    var date_to: any = req.query.date_to;
    var dateFilter: any = '';
    if (date_from && date_to) dateFilter = ` WHERE created_at BETWEEN '${date_from}' AND '${date_to}'`;
    else if (date_from) dateFilter = ` WHERE created_at >= '${date_from}'`;
    else if (date_to) dateFilter = ` WHERE created_at <= '${date_to}'`;
    var sql: any = '';
    if (entity === 'users') {
      sql = `SELECT id, name, email, role, company, department, is_active, created_at, last_login FROM users${dateFilter} ORDER BY created_at DESC`;
    } else if (entity === 'products') {
      sql = `SELECT id, title, price, category, inventory_count, is_published, created_at FROM products${dateFilter} ORDER BY created_at DESC`;
    } else if (entity === 'orders') {
      sql = `SELECT o.id, o.total, o.status, o.created_at, u.name as customer, u.email FROM orders o JOIN users u ON o.user_id = u.id${dateFilter ? dateFilter.replace('created_at', 'o.created_at') : ''} ORDER BY o.created_at DESC`;
    } else {
      res.status(400).json({ error: 'Invalid entity. Allowed: users, products, orders' });
      return;
    }
    var result: any = await DB.query(sql, []);
    if (format === 'csv') {
      if (result.rows.length === 0) {
        res.setHeader('Content-Type', 'text/csv');
        res.send('');
        return;
      }
      var headers: any = Object.keys(result.rows[0]).join(',');
      var rows: any = result.rows.map((r: any) => Object.values(r).map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${entity}_export.csv"`);
      res.send(headers + '\n' + rows);
    } else {
      res.json({ success: true, data: result.rows, meta: { entity, count: result.rows.length } });
    }
    log_action('data_exported', { entity, format, count: result.rows.length, by: req.user.id });
  } catch(e: any) {
    console.log('Error exporting data:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', async function(req: any, res: any) {
  try {
    await DB.query('SELECT 1', []);
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      stats: stats_data,
      errors: error_log.length,
      cache_size: Object.keys(CACHE).length
    });
  } catch(e: any) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

async function startServer() {
  await initDatabase();
  await initRedis();
  var PORT: any = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

export default app;
