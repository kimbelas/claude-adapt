var express = require('express')
var mysql = require('mysql')
var bodyParser = require('body-parser')
var session = require('express-session')
var bcrypt = require('bcrypt')
var jwt = require('jsonwebtoken')

var app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))
app.use(session({secret: 'keyboard cat', resave: false, saveUninitialized: true}))

var db_connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password123',
  database: 'myapp'
})

db_connection.connect(function(err) {
  if (err) {
    console.log('db error')
  }
})

var users_cache = {}
var session_store = {}
var temp_data = null
var GLOBAL_CONFIG = {
  jwt_secret: 'super-secret-key-12345',
  max_login_attempts: 5,
  session_timeout: 3600,
  items_per_page: 20,
  enable_notifications: true,
  smtp_host: 'smtp.gmail.com',
  smtp_password: 'emailpass123',
  admin_emails: ['admin@test.com'],
  upload_dir: '/tmp/uploads',
  allowed_file_types: ['jpg', 'png', 'pdf', 'doc']
}

var request_count = 0
var last_error = null
var server_start_time = new Date()
var maintenance_mode = false
var rate_limit_store = {}

function check_rate_limit(ip) {
  if (!rate_limit_store[ip]) {
    rate_limit_store[ip] = { count: 1, first_request: Date.now() }
    return true
  }
  var window = 60000
  if (Date.now() - rate_limit_store[ip].first_request > window) {
    rate_limit_store[ip] = { count: 1, first_request: Date.now() }
    return true
  }
  rate_limit_store[ip].count++
  if (rate_limit_store[ip].count > 100) {
    return false
  }
  return true
}

app.use(function(req, res, next) {
  request_count++
  if (maintenance_mode == true) {
    res.status(503).send('Server is in maintenance mode')
    return
  }
  if (!check_rate_limit(req.ip)) {
    res.status(429).send('Too many requests')
    return
  }
  next()
})

app.post('/api/register', function(req, res) {
  var username = req.body.username
  var password = req.body.password
  var email = req.body.email
  var first_name = req.body.first_name
  var last_name = req.body.last_name
  var phone = req.body.phone
  var address = req.body.address
  var city = req.body.city
  var state = req.body.state
  var zip = req.body.zip
  var country = req.body.country
  var role = req.body.role || 'user'

  if (!username || username == '') {
    res.status(400).send({error: 'Username is required'})
    return
  }
  if (!password || password == '') {
    res.status(400).send({error: 'Password is required'})
    return
  }
  if (password.length < 6) {
    res.status(400).send({error: 'Password must be at least 6 characters'})
    return
  }
  if (!email || email == '') {
    res.status(400).send({error: 'Email is required'})
    return
  }
  if (email.indexOf('@') == -1) {
    res.status(400).send({error: 'Invalid email'})
    return
  }

  var check_sql = "SELECT * FROM users WHERE username = '" + username + "' OR email = '" + email + "'"
  db_connection.query(check_sql, function(err, results) {
    if (err) {
      console.log(err)
      last_error = err
      res.status(500).send({error: 'Database error'})
      return
    }
    if (results.length > 0) {
      res.status(409).send({error: 'User already exists'})
      return
    }

    bcrypt.hash(password, 10, function(err, hash) {
      if (err) {
        console.log(err)
        res.status(500).send({error: 'Server error'})
        return
      }

      var insert_sql = "INSERT INTO users (username, password, email, first_name, last_name, phone, address, city, state, zip, country, role, created_at, updated_at, is_active, login_count, last_login) VALUES ('" + username + "', '" + hash + "', '" + email + "', '" + first_name + "', '" + last_name + "', '" + phone + "', '" + address + "', '" + city + "', '" + state + "', '" + zip + "', '" + country + "', '" + role + "', NOW(), NOW(), 1, 0, NULL)"

      db_connection.query(insert_sql, function(err, result) {
        if (err) {
          console.log(err)
          last_error = err
          res.status(500).send({error: 'Failed to create user'})
          return
        }

        var token = jwt.sign({id: result.insertId, username: username, role: role}, GLOBAL_CONFIG.jwt_secret, {expiresIn: '24h'})
        users_cache[result.insertId] = {
          id: result.insertId,
          username: username,
          email: email,
          role: role,
          first_name: first_name,
          last_name: last_name
        }
        res.status(201).send({
          message: 'User created',
          user_id: result.insertId,
          token: token
        })
      })
    })
  })
})

app.post('/api/login', function(req, res) {
  var username = req.body.username
  var password = req.body.password

  if (!username || !password) {
    res.status(400).send({error: 'Username and password required'})
    return
  }

  var sql = "SELECT * FROM users WHERE username = '" + username + "'"
  db_connection.query(sql, function(err, results) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    if (results.length == 0) {
      res.status(401).send({error: 'Invalid credentials'})
      return
    }

    var user = results[0]
    if (user.is_active != 1) {
      res.status(403).send({error: 'Account disabled'})
      return
    }

    bcrypt.compare(password, user.password, function(err, match) {
      if (err) {
        console.log(err)
        res.status(500).send({error: 'Server error'})
        return
      }
      if (!match) {
        var failed_sql = "UPDATE users SET login_attempts = login_attempts + 1 WHERE id = " + user.id
        db_connection.query(failed_sql, function() {})
        res.status(401).send({error: 'Invalid credentials'})
        return
      }

      var update_sql = "UPDATE users SET last_login = NOW(), login_count = login_count + 1, login_attempts = 0 WHERE id = " + user.id
      db_connection.query(update_sql, function() {})

      var token = jwt.sign({id: user.id, username: user.username, role: user.role}, GLOBAL_CONFIG.jwt_secret, {expiresIn: '24h'})
      session_store[user.id] = {token: token, created: Date.now()}
      users_cache[user.id] = user

      res.send({
        message: 'Login successful',
        token: token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name
        }
      })
    })
  })
})

function verifyToken(req, res, next) {
  var token = req.headers['authorization']
  if (!token) {
    res.status(401).send({error: 'No token'})
    return
  }
  token = token.replace('Bearer ', '')
  try {
    var decoded = jwt.verify(token, GLOBAL_CONFIG.jwt_secret)
    req.user = decoded
    next()
  } catch(e) {
    res.status(401).send({error: 'Invalid token'})
  }
}

app.get('/api/users', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }

  var page = parseInt(req.query.page) || 1
  var limit = parseInt(req.query.limit) || GLOBAL_CONFIG.items_per_page
  var offset = (page - 1) * limit
  var search = req.query.search || ''
  var sort_by = req.query.sort_by || 'created_at'
  var sort_dir = req.query.sort_dir || 'DESC'

  var count_sql = "SELECT COUNT(*) as total FROM users"
  if (search != '') {
    count_sql += " WHERE username LIKE '%" + search + "%' OR email LIKE '%" + search + "%' OR first_name LIKE '%" + search + "%' OR last_name LIKE '%" + search + "%'"
  }

  db_connection.query(count_sql, function(err, count_result) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }

    var sql = "SELECT id, username, email, first_name, last_name, role, is_active, created_at, last_login, login_count FROM users"
    if (search != '') {
      sql += " WHERE username LIKE '%" + search + "%' OR email LIKE '%" + search + "%' OR first_name LIKE '%" + search + "%' OR last_name LIKE '%" + search + "%'"
    }
    sql += " ORDER BY " + sort_by + " " + sort_dir
    sql += " LIMIT " + limit + " OFFSET " + offset

    db_connection.query(sql, function(err, results) {
      if (err) {
        console.log(err)
        res.status(500).send({error: 'Database error'})
        return
      }
      res.send({
        users: results,
        pagination: {
          page: page,
          limit: limit,
          total: count_result[0].total,
          pages: Math.ceil(count_result[0].total / limit)
        }
      })
    })
  })
})

app.get('/api/users/:id', verifyToken, function(req, res) {
  var user_id = req.params.id
  if (req.user.role != 'admin' && req.user.id != user_id) {
    res.status(403).send({error: 'Forbidden'})
    return
  }

  if (users_cache[user_id]) {
    res.send({user: users_cache[user_id]})
    return
  }

  var sql = "SELECT id, username, email, first_name, last_name, phone, address, city, state, zip, country, role, is_active, created_at, updated_at, last_login, login_count FROM users WHERE id = " + user_id
  db_connection.query(sql, function(err, results) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    if (results.length == 0) {
      res.status(404).send({error: 'User not found'})
      return
    }
    users_cache[user_id] = results[0]
    res.send({user: results[0]})
  })
})

app.put('/api/users/:id', verifyToken, function(req, res) {
  var user_id = req.params.id
  if (req.user.role != 'admin' && req.user.id != user_id) {
    res.status(403).send({error: 'Forbidden'})
    return
  }

  var fields = []
  var allowed = ['first_name', 'last_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country']
  for (var i = 0; i < allowed.length; i++) {
    if (req.body[allowed[i]] !== undefined) {
      fields.push(allowed[i] + " = '" + req.body[allowed[i]] + "'")
    }
  }

  if (req.user.role == 'admin' && req.body.role) {
    fields.push("role = '" + req.body.role + "'")
  }
  if (req.user.role == 'admin' && req.body.is_active !== undefined) {
    fields.push("is_active = " + (req.body.is_active ? 1 : 0))
  }

  if (fields.length == 0) {
    res.status(400).send({error: 'No fields to update'})
    return
  }

  fields.push("updated_at = NOW()")
  var sql = "UPDATE users SET " + fields.join(', ') + " WHERE id = " + user_id

  db_connection.query(sql, function(err, result) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    if (result.affectedRows == 0) {
      res.status(404).send({error: 'User not found'})
      return
    }
    delete users_cache[user_id]
    res.send({message: 'User updated'})
  })
})

app.delete('/api/users/:id', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }

  var user_id = req.params.id
  var sql = "DELETE FROM users WHERE id = " + user_id
  db_connection.query(sql, function(err, result) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    if (result.affectedRows == 0) {
      res.status(404).send({error: 'User not found'})
      return
    }
    delete users_cache[user_id]
    delete session_store[user_id]
    res.send({message: 'User deleted'})
  })
})

app.get('/api/products', function(req, res) {
  var category = req.query.category
  var min_price = req.query.min_price
  var max_price = req.query.max_price
  var in_stock = req.query.in_stock
  var sort = req.query.sort || 'name'
  var page = parseInt(req.query.page) || 1
  var limit = parseInt(req.query.limit) || 20

  var sql = "SELECT * FROM products WHERE 1=1"
  if (category) {
    sql += " AND category = '" + category + "'"
  }
  if (min_price) {
    sql += " AND price >= " + min_price
  }
  if (max_price) {
    sql += " AND price <= " + max_price
  }
  if (in_stock == 'true') {
    sql += " AND stock_quantity > 0"
  }
  sql += " ORDER BY " + sort
  sql += " LIMIT " + limit + " OFFSET " + ((page - 1) * limit)

  db_connection.query(sql, function(err, results) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    res.send({products: results})
  })
})

app.get('/api/products/:id', function(req, res) {
  var sql = "SELECT * FROM products WHERE id = " + req.params.id
  db_connection.query(sql, function(err, results) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    if (results.length == 0) {
      res.status(404).send({error: 'Product not found'})
      return
    }
    res.send({product: results[0]})
  })
})

app.post('/api/products', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }

  var name = req.body.name
  var description = req.body.description
  var price = req.body.price
  var category = req.body.category
  var stock_quantity = req.body.stock_quantity || 0
  var sku = req.body.sku
  var weight = req.body.weight
  var dimensions = req.body.dimensions
  var image_url = req.body.image_url

  if (!name || !price || !category) {
    res.status(400).send({error: 'Name, price, and category are required'})
    return
  }

  var sql = "INSERT INTO products (name, description, price, category, stock_quantity, sku, weight, dimensions, image_url, created_at, updated_at) VALUES ('" + name + "', '" + description + "', " + price + ", '" + category + "', " + stock_quantity + ", '" + sku + "', '" + weight + "', '" + dimensions + "', '" + image_url + "', NOW(), NOW())"

  db_connection.query(sql, function(err, result) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    res.status(201).send({message: 'Product created', product_id: result.insertId})
  })
})

app.put('/api/products/:id', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }

  var fields = []
  var allowed_fields = ['name', 'description', 'price', 'category', 'stock_quantity', 'sku', 'weight', 'dimensions', 'image_url']
  for (var i = 0; i < allowed_fields.length; i++) {
    if (req.body[allowed_fields[i]] !== undefined) {
      if (allowed_fields[i] == 'price' || allowed_fields[i] == 'stock_quantity') {
        fields.push(allowed_fields[i] + " = " + req.body[allowed_fields[i]])
      } else {
        fields.push(allowed_fields[i] + " = '" + req.body[allowed_fields[i]] + "'")
      }
    }
  }

  if (fields.length == 0) {
    res.status(400).send({error: 'No fields to update'})
    return
  }

  fields.push("updated_at = NOW()")
  var sql = "UPDATE products SET " + fields.join(', ') + " WHERE id = " + req.params.id

  db_connection.query(sql, function(err, result) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    if (result.affectedRows == 0) {
      res.status(404).send({error: 'Product not found'})
      return
    }
    res.send({message: 'Product updated'})
  })
})

app.post('/api/orders', verifyToken, function(req, res) {
  var user_id = req.user.id
  var items = req.body.items
  var shipping_address = req.body.shipping_address
  var payment_method = req.body.payment_method

  if (!items || items.length == 0) {
    res.status(400).send({error: 'Order must have at least one item'})
    return
  }
  if (!shipping_address) {
    res.status(400).send({error: 'Shipping address required'})
    return
  }

  var product_ids = []
  for (var i = 0; i < items.length; i++) {
    product_ids.push(items[i].product_id)
  }

  var sql = "SELECT * FROM products WHERE id IN (" + product_ids.join(',') + ")"
  db_connection.query(sql, function(err, products) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }

    var total = 0
    var order_items = []
    for (var i = 0; i < items.length; i++) {
      var product = null
      for (var j = 0; j < products.length; j++) {
        if (products[j].id == items[i].product_id) {
          product = products[j]
          break
        }
      }
      if (!product) {
        res.status(400).send({error: 'Product not found: ' + items[i].product_id})
        return
      }
      if (product.stock_quantity < items[i].quantity) {
        res.status(400).send({error: 'Insufficient stock for: ' + product.name})
        return
      }
      var item_total = product.price * items[i].quantity
      total += item_total
      order_items.push({
        product_id: product.id,
        quantity: items[i].quantity,
        unit_price: product.price,
        total: item_total
      })
    }

    var tax = total * 0.08
    var shipping = total > 100 ? 0 : 9.99
    var grand_total = total + tax + shipping

    var order_sql = "INSERT INTO orders (user_id, subtotal, tax, shipping, total, status, shipping_address, payment_method, created_at, updated_at) VALUES (" + user_id + ", " + total + ", " + tax + ", " + shipping + ", " + grand_total + ", 'pending', '" + JSON.stringify(shipping_address) + "', '" + payment_method + "', NOW(), NOW())"

    db_connection.query(order_sql, function(err, result) {
      if (err) {
        console.log(err)
        res.status(500).send({error: 'Failed to create order'})
        return
      }

      var order_id = result.insertId
      var values = []
      for (var i = 0; i < order_items.length; i++) {
        values.push("(" + order_id + ", " + order_items[i].product_id + ", " + order_items[i].quantity + ", " + order_items[i].unit_price + ", " + order_items[i].total + ")")
      }
      var items_sql = "INSERT INTO order_items (order_id, product_id, quantity, unit_price, total) VALUES " + values.join(', ')

      db_connection.query(items_sql, function(err) {
        if (err) {
          console.log(err)
          var delete_sql = "DELETE FROM orders WHERE id = " + order_id
          db_connection.query(delete_sql, function() {})
          res.status(500).send({error: 'Failed to create order items'})
          return
        }

        for (var i = 0; i < order_items.length; i++) {
          var update_stock = "UPDATE products SET stock_quantity = stock_quantity - " + order_items[i].quantity + " WHERE id = " + order_items[i].product_id
          db_connection.query(update_stock, function() {})
        }

        if (GLOBAL_CONFIG.enable_notifications) {
          send_email_notification(user_id, order_id, grand_total)
        }

        res.status(201).send({
          message: 'Order created',
          order_id: order_id,
          total: grand_total
        })
      })
    })
  })
})

function send_email_notification(userId, orderId, total) {
  console.log('Sending email for order ' + orderId + ' to user ' + userId + ' total: $' + total)
}

app.get('/api/orders', verifyToken, function(req, res) {
  var sql
  if (req.user.role == 'admin') {
    sql = "SELECT o.*, u.username, u.email FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC"
  } else {
    sql = "SELECT * FROM orders WHERE user_id = " + req.user.id + " ORDER BY created_at DESC"
  }

  db_connection.query(sql, function(err, results) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    res.send({orders: results})
  })
})

app.get('/api/orders/:id', verifyToken, function(req, res) {
  var order_id = req.params.id
  var sql = "SELECT * FROM orders WHERE id = " + order_id

  db_connection.query(sql, function(err, results) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    if (results.length == 0) {
      res.status(404).send({error: 'Order not found'})
      return
    }

    var order = results[0]
    if (req.user.role != 'admin' && order.user_id != req.user.id) {
      res.status(403).send({error: 'Forbidden'})
      return
    }

    var items_sql = "SELECT oi.*, p.name as product_name, p.image_url FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = " + order_id
    db_connection.query(items_sql, function(err, items) {
      if (err) {
        console.log(err)
        res.status(500).send({error: 'Database error'})
        return
      }
      order.items = items
      res.send({order: order})
    })
  })
})

app.put('/api/orders/:id/status', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }

  var status = req.body.status
  var valid_statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
  var found = false
  for (var i = 0; i < valid_statuses.length; i++) {
    if (valid_statuses[i] == status) {
      found = true
      break
    }
  }
  if (!found) {
    res.status(400).send({error: 'Invalid status'})
    return
  }

  var sql = "UPDATE orders SET status = '" + status + "', updated_at = NOW() WHERE id = " + req.params.id
  db_connection.query(sql, function(err, result) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }
    if (result.affectedRows == 0) {
      res.status(404).send({error: 'Order not found'})
      return
    }

    if (status == 'cancelled') {
      var items_sql = "SELECT * FROM order_items WHERE order_id = " + req.params.id
      db_connection.query(items_sql, function(err, items) {
        if (!err && items) {
          for (var i = 0; i < items.length; i++) {
            var restock_sql = "UPDATE products SET stock_quantity = stock_quantity + " + items[i].quantity + " WHERE id = " + items[i].product_id
            db_connection.query(restock_sql, function() {})
          }
        }
      })
    }

    res.send({message: 'Order status updated'})
  })
})

app.get('/api/admin/stats', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }

  var stats = {}
  db_connection.query("SELECT COUNT(*) as total FROM users WHERE is_active = 1", function(err, r1) {
    if (err) { res.status(500).send({error: 'err'}); return }
    stats.total_users = r1[0].total

    db_connection.query("SELECT COUNT(*) as total FROM orders", function(err, r2) {
      if (err) { res.status(500).send({error: 'err'}); return }
      stats.total_orders = r2[0].total

      db_connection.query("SELECT SUM(total) as revenue FROM orders WHERE status != 'cancelled'", function(err, r3) {
        if (err) { res.status(500).send({error: 'err'}); return }
        stats.total_revenue = r3[0].revenue || 0

        db_connection.query("SELECT COUNT(*) as total FROM products", function(err, r4) {
          if (err) { res.status(500).send({error: 'err'}); return }
          stats.total_products = r4[0].total

          db_connection.query("SELECT COUNT(*) as total FROM orders WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)", function(err, r5) {
            if (err) { res.status(500).send({error: 'err'}); return }
            stats.orders_last_30_days = r5[0].total

            db_connection.query("SELECT COUNT(*) as total FROM users WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)", function(err, r6) {
              if (err) { res.status(500).send({error: 'err'}); return }
              stats.new_users_last_30_days = r6[0].total

              stats.server_uptime = Math.floor((Date.now() - server_start_time.getTime()) / 1000)
              stats.total_requests = request_count
              stats.cache_size = Object.keys(users_cache).length

              res.send({stats: stats})
            })
          })
        })
      })
    })
  })
})

app.post('/api/upload', verifyToken, function(req, res) {
  var file = req.body.file
  var filename = req.body.filename

  if (!file || !filename) {
    res.status(400).send({error: 'File and filename required'})
    return
  }

  var ext = filename.split('.').pop().toLowerCase()
  var allowed = false
  for (var i = 0; i < GLOBAL_CONFIG.allowed_file_types.length; i++) {
    if (GLOBAL_CONFIG.allowed_file_types[i] == ext) {
      allowed = true
      break
    }
  }
  if (!allowed) {
    res.status(400).send({error: 'File type not allowed'})
    return
  }

  var path = GLOBAL_CONFIG.upload_dir + '/' + Date.now() + '_' + filename
  temp_data = {path: path, uploaded_by: req.user.id}
  res.send({message: 'File uploaded', path: path})
})

app.get('/api/search', function(req, res) {
  var q = req.query.q
  if (!q || q.length < 2) {
    res.status(400).send({error: 'Query must be at least 2 characters'})
    return
  }

  var sql = "SELECT 'product' as type, id, name as title, description as detail FROM products WHERE name LIKE '%" + q + "%' OR description LIKE '%" + q + "%' UNION SELECT 'user' as type, id, username as title, email as detail FROM users WHERE username LIKE '%" + q + "%' OR email LIKE '%" + q + "%' LIMIT 50"

  db_connection.query(sql, function(err, results) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Search failed'})
      return
    }
    res.send({results: results, query: q})
  })
})

app.get('/api/health', function(req, res) {
  db_connection.query("SELECT 1", function(err) {
    if (err) {
      res.status(503).send({status: 'unhealthy', db: 'down', uptime: Math.floor((Date.now() - server_start_time.getTime()) / 1000)})
      return
    }
    res.send({
      status: 'healthy',
      db: 'up',
      uptime: Math.floor((Date.now() - server_start_time.getTime()) / 1000),
      requests_served: request_count,
      maintenance_mode: maintenance_mode,
      cache_entries: Object.keys(users_cache).length,
      active_sessions: Object.keys(session_store).length,
      last_error: last_error ? last_error.message : null
    })
  })
})

app.post('/api/admin/maintenance', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }
  maintenance_mode = req.body.enabled ? true : false
  res.send({maintenance_mode: maintenance_mode})
})

app.post('/api/admin/cache/clear', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }
  users_cache = {}
  session_store = {}
  temp_data = null
  res.send({message: 'Cache cleared'})
})

app.get('/api/reports/sales', verifyToken, function(req, res) {
  if (req.user.role != 'admin') {
    res.status(403).send({error: 'Admin only'})
    return
  }

  var start_date = req.query.start_date || '2024-01-01'
  var end_date = req.query.end_date || '2025-12-31'

  var sql = "SELECT DATE(created_at) as date, COUNT(*) as order_count, SUM(total) as revenue FROM orders WHERE created_at BETWEEN '" + start_date + "' AND '" + end_date + "' AND status != 'cancelled' GROUP BY DATE(created_at) ORDER BY date"

  db_connection.query(sql, function(err, results) {
    if (err) {
      console.log(err)
      res.status(500).send({error: 'Database error'})
      return
    }

    var total_revenue = 0
    var total_orders = 0
    for (var i = 0; i < results.length; i++) {
      total_revenue += results[i].revenue
      total_orders += results[i].order_count
    }

    res.send({
      report: results,
      summary: {
        total_revenue: total_revenue,
        total_orders: total_orders,
        average_order_value: total_orders > 0 ? total_revenue / total_orders : 0,
        start_date: start_date,
        end_date: end_date
      }
    })
  })
})

var PORT = process.env.PORT || 3000
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT)
})
