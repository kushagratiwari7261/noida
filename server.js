import express from "express";
import cors from "cors";
import Imap from "imap";
import { simpleParser } from "mailparser";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from 'url';

// =====================================================
// ENVIRONMENT & CONFIGURATION
// =====================================================

const loadEnv = async () => {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
      console.log('✅ Loaded environment variables from .env file');
    } catch (error) {
      console.log('⚠️ dotenv not available, using platform environment variables');
    }
  }
};

await loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// =====================================================
// ENHANCED LRU CACHE
// =====================================================

class LRUCache {
  constructor(maxSize = 2000, ttl = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return null;
    }
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  size() {
    return this.cache.size;
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%'
    };
  }
}

const cache = new LRUCache(2000, 300000);

// =====================================================
// CONCURRENCY LIMITER (p-limit implementation)
// =====================================================

function pLimit(concurrency) {
  const queue = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()();
    }
  };

  const run = async (fn, resolve, reject) => {
    activeCount++;
    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      next();
    }
  };

  const enqueue = (fn) => {
    return new Promise((resolve, reject) => {
      const execute = () => run(fn, resolve, reject);
      
      if (activeCount < concurrency) {
        execute();
      } else {
        queue.push(execute);
      }
    });
  };

  return enqueue;
}

// =====================================================
// CORS CONFIGURATION
// =====================================================

app.use(cors({
  origin: function (origin, callback) {
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3001',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3001'
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow in development
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =====================================================
// REQUEST LOGGING & PERFORMANCE TRACKING
// =====================================================

app.use((req, res, next) => {
  req.startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const logLevel = duration > 1000 ? '⚠️ SLOW' : duration > 5000 ? '🚨 CRITICAL' : '✅';
    
    if (duration > 500 || req.path.includes('/fetch-emails')) {
      console.log(`${logLevel} ${req.method} ${req.path} - ${duration}ms - ${res.statusCode}`);
    }
  });
  
  next();
});

// =====================================================
// SUPABASE INITIALIZATION
// =====================================================

let supabase = null;
let supabaseEnabled = false;

const initializeSupabase = () => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Supabase environment variables not set");
      return false;
    }

    console.log("🔗 Initializing Supabase...");
    
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { 
        persistSession: false,
        autoRefreshToken: false 
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: { 
          'X-Client-Info': 'email-backend-v2',
          'Connection': 'keep-alive'
        }
      }
    });
    
    supabaseEnabled = true;
    console.log("✅ Supabase client initialized");
    
    testSupabaseConnection();
    return true;
  } catch (error) {
    console.error("❌ Supabase init failed:", error.message);
    return false;
  }
};

const testSupabaseConnection = async () => {
  try {
    if (supabaseEnabled && supabase) {
      const { error } = await supabase.from('emails').select('message_id').limit(1);
      if (error) {
        console.error("❌ Supabase connection test failed:", error.message);
      } else {
        console.log("✅ Supabase connection test successful");
      }
    }
  } catch (error) {
    console.error("❌ Supabase connection test error:", error.message);
  }
};

initializeSupabase();

// =====================================================
// USER-EMAIL MAPPING
// =====================================================

const USER_EMAIL_MAPPING = {
  "info@seal.co.in": [1],
  "pankaj.singh@seal.co.in": [2],
  "anshuman.singh@seal.co.in": [1, 2],
  "transport@seal.co.in": [1, 2]
};

// =====================================================
// EMAIL CONFIGURATION MANAGER
// =====================================================

class EmailConfigManager {
  constructor() {
    this.configs = new Map();
    this.loadConfigs();
  }

  loadConfigs() {
    let configIndex = 1;
    let loadedCount = 0;
    
    while (true) {
      const configValue = process.env[`EMAIL_CONFIG_${configIndex}`];
      if (!configValue) break;

      const [email, password] = configValue.split(':');
      if (email && password) {
        this.configs.set(configIndex, {
          id: configIndex,
          email: email.trim(),
          password: password.trim(),
          name: `Account ${configIndex} (${email.trim()})`
        });
        console.log(`✅ Loaded email config ${configIndex}: ${email.trim()}`);
        loadedCount++;
      }
      configIndex++;
    }

    console.log(`📧 Loaded ${loadedCount} email configurations`);
  }

  getConfig(configId) {
    return this.configs.get(parseInt(configId));
  }

  getAllConfigs() {
    return Array.from(this.configs.values());
  }

  getAllowedAccounts(userEmail) {
    const allowedIds = USER_EMAIL_MAPPING[userEmail] || [];
    return this.getAllConfigs().filter(config => allowedIds.includes(config.id));
  }

  canUserAccessAccount(userEmail, accountId) {
    const allowedIds = USER_EMAIL_MAPPING[userEmail] || [];
    return allowedIds.includes(parseInt(accountId));
  }
}

const emailConfigManager = new EmailConfigManager();

// =====================================================
// OPTIMIZED DUPLICATE CHECKING
// =====================================================

async function checkDuplicatesBatch(messageIds, accountId) {
  if (!messageIds.length || !supabaseEnabled) {
    return messageIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
  }

  const cacheKey = `dupes:${accountId}:${messageIds.slice(0, 5).join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .from('emails')
      .select('message_id')
      .eq('account_id', accountId)
      .in('message_id', messageIds);

    const queryTime = Date.now() - startTime;
    
    if (queryTime > 1000) {
      console.log(`⚠️ Slow duplicate check: ${queryTime}ms for ${messageIds.length} IDs`);
    }

    if (error) throw error;

    const existingSet = new Set(data?.map(e => e.message_id) || []);
    const result = messageIds.reduce((acc, id) => ({
      ...acc,
      [id]: existingSet.has(id)
    }), {});

    cache.set(cacheKey, result);
    
    const duplicateCount = Object.values(result).filter(Boolean).length;
    console.log(`🔍 Duplicate check: ${duplicateCount}/${messageIds.length} existing (${queryTime}ms)`);
    
    return result;
  } catch (error) {
    console.error("❌ Duplicate check error:", error.message);
    return messageIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
  }
}

// =====================================================
// ATTACHMENT UPLOAD WITH RETRY
// =====================================================

async function uploadAttachmentWithRetry(attachment, messageId, accountId, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (!supabaseEnabled || !supabase) return null;

      const fileExtension = attachment.filename ? path.extname(attachment.filename) : '.bin';
      const uniqueFilename = `${messageId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}${fileExtension}`;
      const filePath = `account_${accountId}/${uniqueFilename}`;

      const { error } = await supabase.storage
        .from('attachments')
        .upload(filePath, attachment.content, {
          contentType: attachment.contentType || 'application/octet-stream',
          upsert: false
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      return {
        filename: attachment.filename || 'unnamed',
        path: filePath,
        url: publicUrl,
        size: attachment.size || 0,
        contentType: attachment.contentType || 'application/octet-stream'
      };
    } catch (error) {
      if (attempt === retries) {
        console.error(`❌ Upload failed after ${retries + 1} attempts:`, error.message);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  return null;
}

// =====================================================
// PROCESS EMAIL WITH PARALLEL ATTACHMENTS
// =====================================================

async function processEmailFast(parsed, messageId, accountId) {
  const emailData = {
    messageId,
    accountId,
    subject: parsed.subject || '(No Subject)',
    from: parsed.from?.text || "",
    to: parsed.to?.text || "",
    date: parsed.date || new Date(),
    text: parsed.text || "",
    html: parsed.html || "",
    attachments: [],
    hasAttachments: false,
    attachmentsCount: 0
  };

  if (parsed.attachments?.length > 0) {
    const limit = pLimit(3);
    const uploadPromises = parsed.attachments
      .filter(att => att.content && att.size < 25 * 1024 * 1024) // Max 25MB
      .map(att => limit(() => uploadAttachmentWithRetry(att, messageId, accountId)));
    
    const results = await Promise.allSettled(uploadPromises);
    
    emailData.attachments = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => ({
        ...r.value,
        accountId,
        messageId
      }));
    
    emailData.hasAttachments = emailData.attachments.length > 0;
    emailData.attachmentsCount = emailData.attachments.length;
    
    if (emailData.attachments.length < parsed.attachments.length) {
      console.log(`⚠️ Only ${emailData.attachments.length}/${parsed.attachments.length} attachments uploaded`);
    }
  }

  return emailData;
}

// =====================================================
// BATCH UPSERT EMAILS
// =====================================================

async function upsertEmailsBatch(emails, batchSize = 10) {
  if (!emails.length || !supabaseEnabled) {
    return { saved: 0, updated: 0, failed: 0 };
  }

  let saved = 0, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    
    try {
      const { error } = await supabase
        .from('emails')
        .upsert(
          batch.map(email => ({
            message_id: email.messageId,
            account_id: email.accountId,
            subject: email.subject,
            from_text: email.from,
            to_text: email.to,
            date: email.date,
            text_content: email.text,
            html_content: email.html,
            attachments: email.attachments || [],
            has_attachments: email.hasAttachments || false,
            attachments_count: email.attachmentsCount || 0,
            updated_at: new Date()
          })),
          { 
            onConflict: 'message_id,account_id',
            ignoreDuplicates: false 
          }
        );

      if (error) {
        console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
        failed += batch.length;
      } else {
        saved += batch.length;
      }
    } catch (error) {
      console.error(`❌ Batch error:`, error.message);
      failed += batch.length;
    }

    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`💾 Upsert complete: ${saved} saved, ${failed} failed in ${totalTime}ms`);

  return { saved, updated: 0, failed };
}

// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: "Authentication required" 
      });
    }

    const token = authHeader.substring(7);
    const cacheKey = `auth:${token.substring(0, 20)}`;
    const cachedUser = cache.get(cacheKey);
    
    if (cachedUser) {
      req.user = cachedUser;
      return next();
    }

    if (!supabaseEnabled) {
      return res.status(500).json({ 
        success: false, 
        error: "Auth service unavailable" 
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user?.email) {
      return res.status(401).json({ 
        success: false, 
        error: "Authentication failed" 
      });
    }

    const userData = { email: user.email, id: user.id };
    cache.set(cacheKey, userData);
    req.user = userData;
    next();
  } catch (error) {
    console.error("❌ Auth error:", error);
    return res.status(401).json({ 
      success: false, 
      error: "Authentication failed" 
    });
  }
};

// =====================================================
// AUTHORIZATION MIDDLEWARE
// =====================================================

const authorizeEmailAccess = () => {
  return (req, res, next) => {
    const userEmail = req.user.email;
    const targetAccountId = req.body.accountId || req.query.accountId;
    
    if (!targetAccountId || targetAccountId === 'all') {
      const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
      if (!allowedAccounts.length) {
        return res.status(403).json({ 
          success: false, 
          error: "No accounts accessible" 
        });
      }
      return next();
    }
    
    if (!emailConfigManager.canUserAccessAccount(userEmail, targetAccountId)) {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied to this account" 
      });
    }
    
    next();
  };
};

// =====================================================
// IMAP CONNECTION POOL
// =====================================================

class IMAPConnectionPool {
  constructor() {
    this.connections = new Map();
    this.locks = new Map();
    this.connectionTimeout = 30000;
  }

  async getConnection(configId) {
    while (this.locks.get(configId)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (this.connections.has(configId)) {
      const conn = this.connections.get(configId);
      if (conn.isConnected) {
        return conn;
      }
      this.connections.delete(configId);
    }

    this.locks.set(configId, true);
    
    try {
      const config = emailConfigManager.getConfig(configId);
      if (!config) throw new Error(`Config ${configId} not found`);

      const connection = new IMAPConnection(config);
      await connection.connect();
      this.connections.set(configId, connection);
      return connection;
    } finally {
      this.locks.delete(configId);
    }
  }

  closeConnection(configId) {
    const conn = this.connections.get(configId);
    if (conn) {
      conn.disconnect();
      this.connections.delete(configId);
    }
  }

  disconnectAll() {
    for (const [configId] of this.connections) {
      this.closeConnection(configId);
    }
  }
}

class IMAPConnection {
  constructor(config) {
    this.config = config;
    this.connection = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return this.connection;

    return new Promise((resolve, reject) => {
      this.connection = new Imap({
        user: this.config.email,
        password: this.config.password,
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 20000,
        authTimeout: 10000,
        keepalive: { 
          interval: 10000,
          idleInterval: 300000
        }
      });

      const timeout = setTimeout(() => {
        this.isConnected = false;
        reject(new Error('IMAP connection timeout'));
      }, 25000);

      this.connection.once('ready', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        console.log(`✅ IMAP connected: ${this.config.email}`);
        resolve(this.connection);
      });

      this.connection.once('error', (err) => {
        clearTimeout(timeout);
        this.isConnected = false;
        console.error(`❌ IMAP error: ${this.config.email}:`, err.message);
        reject(err);
      });

      this.connection.once('end', () => {
        this.isConnected = false;
        console.log(`📤 IMAP disconnected: ${this.config.email}`);
      });

      this.connection.connect();
    });
  }

  disconnect() {
    if (this.connection && this.isConnected) {
      try {
        this.connection.end();
      } catch (error) {
        console.error('Error disconnecting IMAP:', error.message);
      }
      this.isConnected = false;
    }
  }

  openInbox(cb) {
    this.connection.openBox("INBOX", false, cb);
  }
}

const imapPool = new IMAPConnectionPool();

// =====================================================
// CORE FETCH FUNCTION
// =====================================================

async function fetchAccountEmailsFast(account, fetchCount) {
  const startTime = Date.now();
  
  try {
    console.log(`📧 Fetching account ${account.id}: ${account.email}`);
    const connection = await imapPool.getConnection(account.id);
    
    return await new Promise((resolve) => {
      connection.openInbox(async (err, box) => {
        if (err) {
          console.error(`❌ Inbox open failed:`, err.message);
          return resolve({ 
            accountId: account.id,
            accountEmail: account.email,
            success: false, 
            error: err.message 
          });
        }

        const totalMessages = box.messages.total;
        
        if (totalMessages === 0) {
          return resolve({ 
            accountId: account.id,
            accountEmail: account.email,
            success: true, 
            saved: 0,
            message: 'No messages in inbox'
          });
        }

        const count = Math.min(fetchCount, totalMessages);
        const fetchStart = Math.max(1, totalMessages - count + 1);
        
        console.log(`📨 Fetching ${count} newest emails (${fetchStart}:${totalMessages})`);
        
        const f = connection.connection.seq.fetch(`${fetchStart}:${totalMessages}`, { 
          bodies: "",
          struct: true,
          markSeen: false
        });

        const emailBuffers = [];
        let fetchedCount = 0;

        f.on("message", (msg, seqno) => {
          let buffer = "";
          
          msg.on("body", (stream) => {
            stream.on("data", (chunk) => {
              buffer += chunk.toString("utf8");
            });
          });

          msg.once("end", () => {
            fetchedCount++;
            emailBuffers.push({ buffer, seqno });
            
            if (fetchedCount % 10 === 0) {
              console.log(`  📩 Fetched ${fetchedCount}/${count}...`);
            }
          });
        });

        f.once("error", (err) => {
          console.error(`❌ Fetch error:`, err.message);
          resolve({ 
            accountId: account.id,
            accountEmail: account.email,
            success: false, 
            error: err.message 
          });
        });

        f.once("end", async () => {
          const fetchTime = Date.now() - startTime;
          console.log(`✅ Fetched ${emailBuffers.length} email buffers in ${fetchTime}ms`);
          
          try {
            // Parse emails in parallel
            const parseStartTime = Date.now();
            const parseLimit = pLimit(10);
            
            const parsedEmails = (await Promise.all(
              emailBuffers.map(({ buffer, seqno }) => 
                parseLimit(async () => {
                  try {
                    const parsed = await simpleParser(buffer);
                    return {
                      parsed,
                      messageId: parsed.messageId || `email-${account.id}-${Date.now()}-${seqno}`,
                      seqno
                    };
                  } catch (parseErr) {
                    console.error(`❌ Parse error seqno ${seqno}:`, parseErr.message);
                    return null;
                  }
                })
              )
            )).filter(Boolean);
            
            const parseTime = Date.now() - parseStartTime;
            console.log(`✅ Parsed ${parsedEmails.length} emails in ${parseTime}ms`);

            // Sort by date descending (newest first)
            parsedEmails.sort((a, b) => {
              const dateA = new Date(a.parsed.date || 0);
              const dateB = new Date(b.parsed.date || 0);
              return dateB - dateA;
            });

            // Check duplicates
            const dupCheckStart = Date.now();
            const messageIds = parsedEmails.map(e => e.messageId);
            const duplicates = await checkDuplicatesBatch(messageIds, account.id);
            const newEmails = parsedEmails.filter(e => !duplicates[e.messageId]);
            const dupCheckTime = Date.now() - dupCheckStart;
            
            const duplicateCount = parsedEmails.length - newEmails.length;
            console.log(`🔍 Duplicate check in ${dupCheckTime}ms: ${newEmails.length} new, ${duplicateCount} existing`);

            if (!newEmails.length) {
              return resolve({ 
                accountId: account.id,
                accountEmail: account.email,
                success: true, 
                saved: 0,
                duplicates: duplicateCount,
                message: 'All emails already exist',
                timing: {
                  fetch: fetchTime,
                  parse: parseTime,
                  duplicateCheck: dupCheckTime,
                  total: Date.now() - startTime
                }
              });
            }

            // Process with attachments
            const processStartTime = Date.now();
            const processLimit = pLimit(5);
            
            const processed = (await Promise.all(
              newEmails.map(({ parsed, messageId }) =>
                processLimit(() => processEmailFast(parsed, messageId, account.id))
              )
            )).filter(Boolean);
            
            const processTime = Date.now() - processStartTime;
            console.log(`✅ Processed ${processed.length} emails in ${processTime}ms`);

            // Upsert to database
            const saveStartTime = Date.now();
            const { saved, failed } = await upsertEmailsBatch(processed, 15);
            const saveTime = Date.now() - saveStartTime;
            
            console.log(`💾 Saved ${saved} emails in ${saveTime}ms`);

            const totalTime = Date.now() - startTime;
            
            resolve({
              accountId: account.id,
              accountEmail: account.email,
              success: true,
              saved,
              failed,
              duplicates: duplicateCount,
              total: parsedEmails.length,
              timing: {
                fetch: fetchTime,
                parse: parseTime,
                duplicateCheck: dupCheckTime,
                process: processTime,
                save: saveTime,
                total: totalTime
              }
            });

          } catch (error) {
            console.error(`❌ Processing error:`, error);
            resolve({ 
              accountId: account.id,
              accountEmail: account.email,
              success: false, 
              error: error.message 
            });
          } finally {
            imapPool.closeConnection(account.id);
          }
        });
      });
    });
  } catch (error) {
    console.error(`❌ Account fetch error:`, error);
    return { 
      accountId: account.id,
      accountEmail: account.email,
      success: false, 
      error: error.message 
    };
  }
}

// =====================================================
// API ENDPOINTS
// =====================================================

// Health check
app.get("/api/health", async (req, res) => {
  try {
    let supabaseStatus = "disconnected";
    
    if (supabaseEnabled && supabase) {
      try {
        const { error } = await supabase.from('emails').select('message_id').limit(1);
        supabaseStatus = error ? "error" : "connected";
      } catch {
        supabaseStatus = "error";
      }
    }

    res.json({
      status: supabaseStatus === "connected" ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      cache: cache.getStats(),
      services: {
        supabase: supabaseStatus,
        emailConfigs: emailConfigManager.getAllConfigs().length,
        imapConnections: imapPool.connections.size
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Email Backend API v2.0 - Optimized",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: "GET /api/health",
      emails: "GET /api/emails (auth required)",
      singleEmail: "GET /api/emails/:messageId (auth required)",
      fetchEmails: "POST /api/fetch-emails (auth required)",
      userAccounts: "GET /api/user-accounts (auth required)",
      deleteEmail: "DELETE /api/emails/:messageId (auth required)",
      clearCache: "POST /api/clear-cache"
    }
  });
});

// =====================================================
// LIST EMAILS (OPTIMIZED - NO CONTENT)
// =====================================================

app.get("/api/emails", authenticateUser, authorizeEmailAccess(), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const {
      search = "",
      sort = "date_desc",
      page = 1,
      limit = 50,
      accountId = "all"
    } = req.query;

    const userEmail = req.user.email;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    const allowedIds = allowedAccounts.map(acc => acc.id);
    
    if (!allowedIds.length) {
      return res.status(403).json({ 
        success: false, 
        error: "No accounts accessible" 
      });
    }

    // Check cache
    const cacheKey = `emails:${userEmail}:${accountId}:${search}:${sort}:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json({ 
        ...cached, 
        cached: true,
        responseTime: Date.now() - startTime 
      });
    }

    if (!supabaseEnabled) {
      return res.status(500).json({ 
        success: false, 
        error: "Database unavailable" 
      });
    }

    // Build query
    let query = supabase
      .from('emails')
      .select(`
        id,
        message_id,
        account_id,
        subject,
        from_text,
        to_text,
        date,
        has_attachments,
        attachments_count,
        created_at
      `, { count: 'exact' });

    // Apply account filter
    if (accountId !== "all") {
      const accountIdNum = parseInt(accountId);
      if (!emailConfigManager.canUserAccessAccount(userEmail, accountIdNum)) {
        return res.status(403).json({ 
          success: false, 
          error: "Access denied to this account" 
        });
      }
      query = query.eq('account_id', accountIdNum);
    } else {
      query = query.in('account_id', allowedIds);
    }

    // Apply search filter
    if (search?.trim()) {
      const searchTerm = search.trim();
      query = query.or(
        `subject.ilike.%${searchTerm}%,` +
        `from_text.ilike.%${searchTerm}%,` +
        `to_text.ilike.%${searchTerm}%`
      );
    }

    // Apply sorting
    const [sortField, sortDir] = sort.split('_');
    query = query.order(
      sortField === 'subject' ? 'subject' : 'date', 
      { ascending: sortDir === 'asc' }
    );

    // Apply pagination
    query = query.range(skip, skip + limitNum - 1);

    const { data: emails, error, count } = await query;

    if (error) {
      console.error("❌ Query error:", error);
      throw error;
    }

    const response = {
      success: true,
      emails: (emails || []).map(e => ({
        id: e.message_id,
        messageId: e.message_id,
        subject: e.subject || '(No Subject)',
        from: e.from_text,
        to: e.to_text,
        date: e.date,
        hasAttachments: e.has_attachments,
        attachmentsCount: e.attachments_count,
        account_id: e.account_id
      })),
      total: count || 0,
      hasMore: skip + (emails?.length || 0) < (count || 0),
      page: pageNum,
      limit: limitNum,
      responseTime: Date.now() - startTime
    };

    cache.set(cacheKey, response);
    res.json(response);

  } catch (error) {
    console.error("❌ List emails error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch emails",
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// =====================================================
// GET SINGLE EMAIL (WITH FULL CONTENT)
// =====================================================

app.get("/api/emails/:messageId", authenticateUser, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { messageId } = req.params;
    const cacheKey = `email:${messageId}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json({ 
        success: true, 
        email: cached, 
        cached: true,
        responseTime: Date.now() - startTime
      });
    }

    if (!supabaseEnabled) {
      return res.status(500).json({ 
        success: false, 
        error: "Database unavailable" 
      });
    }

    const { data: email, error } = await supabase
      .from('emails')
      .select('*')
      .eq('message_id', messageId)
      .single();

    if (error || !email) {
      return res.status(404).json({ 
        success: false, 
        error: "Email not found" 
      });
    }

    if (!emailConfigManager.canUserAccessAccount(req.user.email, email.account_id)) {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied" 
      });
    }

    const emailData = {
      id: email.message_id,
      messageId: email.message_id,
      subject: email.subject || '(No Subject)',
      from: email.from_text,
      to: email.to_text,
      date: email.date,
      text: email.text_content,
      html: email.html_content,
      attachments: email.attachments || [],
      hasAttachments: email.has_attachments,
      attachmentsCount: email.attachments_count,
      account_id: email.account_id,
      created_at: email.created_at,
      updated_at: email.updated_at
    };

    cache.set(cacheKey, emailData);
    
    res.json({ 
      success: true, 
      email: emailData,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error("❌ Get email error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch email",
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// =====================================================
// FETCH EMAILS FROM IMAP (OPTIMIZED)
// =====================================================

app.post("/api/fetch-emails", authenticateUser, authorizeEmailAccess(), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      count = 50,
      accountId = "all",
      mode = "latest"
    } = req.body;
    
    const userEmail = req.user.email;
    const fetchCount = Math.min(parseInt(count) || 50, 100);

    let accountsToProcess = [];
    
    if (accountId === "all") {
      accountsToProcess = emailConfigManager.getAllowedAccounts(userEmail);
    } else {
      if (!emailConfigManager.canUserAccessAccount(userEmail, accountId)) {
        return res.status(403).json({ 
          success: false, 
          error: "Access denied to this account" 
        });
      }
      const config = emailConfigManager.getConfig(accountId);
      if (!config) {
        return res.status(400).json({ 
          success: false, 
          error: `Account ${accountId} not found` 
        });
      }
      accountsToProcess = [config];
    }

    if (!accountsToProcess.length) {
      return res.status(403).json({ 
        success: false, 
        error: "No accounts accessible" 
      });
    }

    console.log(`🚀 Fetch started: ${accountsToProcess.length} accounts, ${fetchCount} emails each`);
    
    // Process accounts in parallel
    const results = await Promise.all(
      accountsToProcess.map(account => fetchAccountEmailsFast(account, fetchCount))
    );

    // Clear cache after successful fetch
    cache.clear();
    console.log('🗑️ Cache cleared after fetch');

    const successfulAccounts = results.filter(r => r.success);
    const totalProcessed = successfulAccounts.reduce((sum, r) => sum + (r.saved || 0), 0);
    const totalTime = Date.now() - startTime;

    console.log(`🎉 Fetch complete: ${totalProcessed} new emails in ${totalTime}ms`);

    res.json({
      success: true,
      message: `Fetched ${totalProcessed} new emails in ${(totalTime / 1000).toFixed(1)}s`,
      summary: {
        totalAccounts: accountsToProcess.length,
        successfulAccounts: successfulAccounts.length,
        failedAccounts: results.length - successfulAccounts.length,
        totalProcessed,
        totalTimeMs: totalTime,
        avgTimePerEmail: totalProcessed > 0 ? Math.round(totalTime / totalProcessed) : 0
      },
      accounts: results,
      userAccess: {
        email: userEmail,
        allowedAccounts: accountsToProcess.map(acc => acc.id)
      }
    });

  } catch (error) {
    console.error("❌ Fetch emails error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch emails",
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// =====================================================
// GET USER ACCOUNTS
// =====================================================

app.get("/api/user-accounts", authenticateUser, (req, res) => {
  try {
    const userEmail = req.user.email;
    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    
    res.json({
      success: true,
      userEmail,
      accounts: allowedAccounts.map(acc => ({
        id: acc.id,
        email: acc.email,
        name: acc.name
      }))
    });
  } catch (error) {
    console.error("❌ Get user accounts error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch user accounts" 
    });
  }
});

// =====================================================
// DELETE EMAIL (WITH ATTACHMENTS)
// =====================================================

app.delete("/api/emails/:messageId", authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userEmail = req.user.email;

    if (!supabaseEnabled) {
      return res.status(500).json({ 
        success: false, 
        error: "Database unavailable" 
      });
    }

    // Fetch email first to check permissions and get attachments
    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('account_id, attachments')
      .eq('message_id', messageId)
      .single();

    if (fetchError || !email) {
      return res.status(404).json({ 
        success: false, 
        error: "Email not found" 
      });
    }

    // Check access
    if (!emailConfigManager.canUserAccessAccount(userEmail, email.account_id)) {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied" 
      });
    }

    // Delete attachments from storage
    if (email.attachments && Array.isArray(email.attachments)) {
      const deletePromises = email.attachments
        .filter(att => att.path)
        .map(async (attachment) => {
          try {
            const { error: deleteError } = await supabase.storage
              .from('attachments')
              .remove([attachment.path]);
            
            if (deleteError) {
              console.error(`⚠️ Failed to delete attachment ${attachment.path}:`, deleteError.message);
            } else {
              console.log(`✅ Deleted attachment: ${attachment.path}`);
            }
          } catch (error) {
            console.error(`❌ Error deleting attachment ${attachment.path}:`, error.message);
          }
        });
      
      await Promise.allSettled(deletePromises);
    }

    // Delete email from database
    const { error: deleteError } = await supabase
      .from('emails')
      .delete()
      .eq('message_id', messageId);

    if (deleteError) {
      console.error("❌ Delete email error:", deleteError);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to delete email" 
      });
    }

    // Clear cache
    cache.clear();

    console.log(`🗑️ Deleted email: ${messageId}`);

    res.json({
      success: true,
      message: "Email and attachments deleted successfully"
    });

  } catch (error) {
    console.error("❌ Delete email error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete email",
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// =====================================================
// CLEAR CACHE
// =====================================================

app.post("/api/clear-cache", (req, res) => {
  try {
    const previousStats = cache.getStats();
    cache.clear();
    
    console.log('🗑️ Cache cleared manually');
    
    res.json({ 
      success: true, 
      message: "Cache cleared successfully",
      previousStats
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: "Failed to clear cache" 
    });
  }
});

// =====================================================
// CACHE STATS (DEBUG ENDPOINT)
// =====================================================

app.get("/api/cache-stats", authenticateUser, (req, res) => {
  res.json({
    success: true,
    stats: cache.getStats()
  });
});

// =====================================================
// ERROR HANDLERS
// =====================================================

// Global error handler
app.use((error, req, res, next) => {
  console.error("🚨 Global error:", error);
  
  res.status(error.status || 500).json({
    success: false,
    error: error.message || "Internal server error",
    ...(process.env.NODE_ENV !== 'production' && { 
      stack: error.stack,
      details: error 
    })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    availableEndpoints: {
      health: 'GET /api/health',
      emails: 'GET /api/emails (auth required)',
      singleEmail: 'GET /api/emails/:messageId (auth required)',
      fetchEmails: 'POST /api/fetch-emails (auth required)',
      userAccounts: 'GET /api/user-accounts (auth required)',
      deleteEmail: 'DELETE /api/emails/:messageId (auth required)',
      clearCache: 'POST /api/clear-cache',
      cacheStats: 'GET /api/cache-stats (auth required)'
    }
  });
});

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

process.on('SIGTERM', async () => {
  console.log('📴 SIGTERM received, shutting down gracefully...');
  
  // Close all IMAP connections
  imapPool.disconnectAll();
  
  // Clear cache
  cache.clear();
  
  console.log('✅ Cleanup complete, exiting...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 SIGINT received, shutting down gracefully...');
  
  imapPool.disconnectAll();
  cache.clear();
  
  console.log('✅ Cleanup complete, exiting...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  
  // Clean up
  imapPool.disconnectAll();
  cache.clear();
  
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

// =====================================================
// EXPORT & START SERVER
// =====================================================

export default app;

// Start server (only in non-production or when not imported as module)
if (process.env.NODE_ENV !== 'production' || import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║          EMAIL BACKEND API v2.0 - OPTIMIZED               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`🌐 External access: http://YOUR_IP:${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log('');
    console.log('📊 System Status:');
    console.log(`   📧 Email accounts: ${emailConfigManager.getAllConfigs().length}`);
    console.log(`   🔐 Supabase: ${supabaseEnabled ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   💾 Cache: ${cache.getStats().maxSize} items max, ${cache.getStats().size} items current`);
    console.log(`   🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('👥 User Access Mappings:');
    Object.entries(USER_EMAIL_MAPPING).forEach(([email, accounts]) => {
      console.log(`   ${email} → accounts [${accounts.join(', ')}]`);
    });
    console.log('');
    console.log('📡 Available Endpoints:');
    console.log('   GET    /api/health              - Health check');
    console.log('   GET    /api/emails              - List emails (paginated)');
    console.log('   GET    /api/emails/:messageId   - Get single email');
    console.log('   POST   /api/fetch-emails        - Fetch from IMAP');
    console.log('   GET    /api/user-accounts       - Get user accounts');
    console.log('   DELETE /api/emails/:messageId   - Delete email');
    console.log('   POST   /api/clear-cache         - Clear cache');
    console.log('   GET    /api/cache-stats         - Cache statistics');
    console.log('');
    console.log('✅ Server ready to accept connections!');
    console.log('');
  });
}