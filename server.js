import express from "express";
import cors from "cors";
import Imap from "imap";
import { simpleParser } from "mailparser";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from 'url';

// Load environment variables
const loadEnv = async () => {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
      console.log('✅ Loaded environment variables from .env file');
    } catch (error) {
      console.log('⚠️ dotenv not available, using platform environment variables');
    }
  } else {
    console.log('✅ Using production environment variables');
  }
};

await loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    if (process.env.NODE_ENV === 'production') {
      callback(null, true);
    } else {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        process.env.FRONTEND_URL
      ].filter(Boolean);
      
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
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

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`, {
    timestamp: new Date().toISOString(),
    origin: req.get('origin')
  });
  next();
});

// Cache configuration
const cache = new Map();
const CACHE_TTL = 300000;

function getFromCache(key) {
  try {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    cache.delete(key);
    return null;
  } catch (error) {
    console.error("❌ Cache get error:", error);
    return null;
  }
}

function setToCache(key, data) {
  try {
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("❌ Cache set error:", error);
  }
}

function clearCache() {
  cache.clear();
  console.log("✅ Cache cleared");
}

// Supabase client
let supabase = null;
let supabaseEnabled = false;

const initializeSupabase = () => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Supabase environment variables not set");
      supabaseEnabled = false;
      return false;
    }

    console.log("🔗 Initializing Supabase...");
    
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { 
        persistSession: false,
        autoRefreshToken: false 
      },
      global: { 
        headers: { 'X-Client-Info': 'email-backend' } 
      }
    });
    
    supabaseEnabled = true;
    console.log("✅ Supabase client created successfully");
    
    testSupabaseConnection();
    return true;
  } catch (error) {
    console.error("❌ Failed to create Supabase client:", error.message);
    supabaseEnabled = false;
    return false;
  }
};

const testSupabaseConnection = async () => {
  try {
    if (supabaseEnabled && supabase) {
      console.log("🧪 Testing Supabase connection...");
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

// User-Email Mapping Configuration
const USER_EMAIL_MAPPING = {
  "info@seal.co.in": [1],
  "pankaj.singh@seal.co.in": [2],
  "anshuman.singh@seal.co.in": [1, 2],
  "transport@seal.co.in": [1, 2]
};

// Email Configuration Manager
class EmailConfigManager {
  constructor() {
    this.configs = new Map();
    this.loadConfigs();
  }

  loadConfigs() {
    try {
      let configIndex = 1;
      let loadedCount = 0;
      
      while (true) {
        const configKey = `EMAIL_CONFIG_${configIndex}`;
        const configValue = process.env[configKey];
        
        if (!configValue) {
          if (configIndex === 1) {
            console.warn("⚠️ No email configurations found");
          }
          break;
        }

        const [email, password] = configValue.split(':');
        if (email && password) {
          this.configs.set(configIndex, {
            id: configIndex,
            email: email.trim(),
            password: password.trim(),
            name: `Account ${configIndex} (${email.trim()})`
          });
          console.log(`✅ Loaded email config ${configIndex}: ${email}`);
          loadedCount++;
        }
        configIndex++;
      }

      console.log(`📧 Loaded ${loadedCount} email configurations`);
    } catch (error) {
      console.error("❌ Error loading email configs:", error);
    }
  }

  getConfig(configId) {
    const id = parseInt(configId);
    if (isNaN(id)) return null;
    return this.configs.get(id);
  }

  getAllConfigs() {
    return Array.from(this.configs.values());
  }

  getAllowedAccounts(userEmail) {
    try {
      const allowedAccountIds = USER_EMAIL_MAPPING[userEmail] || [];
      return this.getAllConfigs().filter(config => 
        allowedAccountIds.includes(config.id)
      );
    } catch (error) {
      console.error("❌ Error getting allowed accounts:", error);
      return [];
    }
  }

  canUserAccessAccount(userEmail, accountId) {
    try {
      const allowedAccountIds = USER_EMAIL_MAPPING[userEmail] || [];
      const accountIdNum = parseInt(accountId);
      return allowedAccountIds.includes(accountIdNum);
    } catch (error) {
      console.error("❌ Error checking account access:", error);
      return false;
    }
  }
}

const emailConfigManager = new EmailConfigManager();

// Batch duplicate checking
async function checkDuplicatesBatch(messageIds, accountId) {
  const cacheKeys = messageIds.map(id => `duplicate:${id}:${accountId}`);
  const cachedResults = {};
  const uncachedIds = [];

  messageIds.forEach((id, index) => {
    const cached = getFromCache(cacheKeys[index]);
    if (cached !== null) {
      cachedResults[id] = cached;
    } else {
      uncachedIds.push(id);
    }
  });

  if (uncachedIds.length > 0 && supabaseEnabled && supabase) {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('message_id')
        .eq('account_id', accountId)
        .in('message_id', uncachedIds);

      if (!error && data) {
        const existingIds = new Set(data.map(e => e.message_id));
        uncachedIds.forEach(id => {
          const isDuplicate = existingIds.has(id);
          cachedResults[id] = isDuplicate;
          setToCache(`duplicate:${id}:${accountId}`, isDuplicate);
        });
      }
    } catch (error) {
      console.error("❌ Batch duplicate check error:", error);
      uncachedIds.forEach(id => {
        cachedResults[id] = false;
      });
    }
  }

  return cachedResults;
}

// Upload attachments to Supabase storage
async function uploadAttachmentToSupabase(attachment, messageId, accountId) {
  try {
    if (!supabaseEnabled || !supabase) return null;

    const fileExtension = attachment.filename ? 
      path.extname(attachment.filename) : '.bin';
    const uniqueFilename = `${messageId}_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;
    const filePath = `account_${accountId}/${uniqueFilename}`;

    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(filePath, attachment.content, {
        contentType: attachment.contentType || 'application/octet-stream',
        upsert: false
      });

    if (error) {
      console.error("❌ Attachment upload error:", error);
      return null;
    }

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
    console.error("❌ Error uploading attachment:", error);
    return null;
  }
}

// Parallel attachment processing
async function uploadAttachmentsBatch(attachments, messageId, accountId, concurrencyLimit = 3) {
  if (!attachments || attachments.length === 0) return [];
  
  const results = [];
  
  for (let i = 0; i < attachments.length; i += concurrencyLimit) {
    const chunk = attachments.slice(i, i + concurrencyLimit);
    const chunkPromises = chunk.map(att => 
      uploadAttachmentToSupabase(att, messageId, accountId)
        .catch(err => {
          console.error(`❌ Attachment upload failed:`, err);
          return null;
        })
    );
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults.filter(r => r !== null));
  }
  
  return results;
}

// Process email with attachments
async function processEmailWithAttachmentsFast(parsed, messageId, accountId, seqno) {
  try {
    const emailData = {
      messageId: messageId,
      accountId: accountId,
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

    if (parsed.attachments && parsed.attachments.length > 0) {
      const uploadedAttachments = await uploadAttachmentsBatch(
        parsed.attachments.filter(att => att.content),
        messageId,
        accountId,
        3
      );
      
      emailData.attachments = uploadedAttachments.map((att, index) => ({
        filename: att.filename || `attachment_${index + 1}`,
        url: att.url,
        size: att.size || 0,
        contentType: att.contentType || 'application/octet-stream',
        path: att.path,
        accountId: accountId,
        messageId: messageId
      }));
      
      emailData.hasAttachments = emailData.attachments.length > 0;
      emailData.attachmentsCount = emailData.attachments.length;
    }

    return emailData;
  } catch (error) {
    console.error("❌ Error processing email:", error);
    throw error;
  }
}

// Batch saving with upsert
async function saveEmailsBatch(emails, batchSize = 10) {
  if (emails.length === 0) return [];
  
  try {
    if (!supabaseEnabled || !supabase) return [];

    const supabaseData = emails.map(email => ({
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
      created_at: new Date(),
      updated_at: new Date()
    }));

    const results = [];
    
    for (let i = 0; i < supabaseData.length; i += batchSize) {
      const batch = supabaseData.slice(i, i + batchSize);
      
      try {
        const { data, error } = await supabase
          .from('emails')
          .upsert(batch, { 
            onConflict: 'message_id,account_id',
            ignoreDuplicates: false 
          });
        
        if (error) {
          console.error(`❌ Batch save error:`, error);
          results.push({ success: false, count: 0 });
        } else {
          results.push({ success: true, count: batch.length });
        }
      } catch (batchError) {
        console.error(`❌ Batch processing error:`, batchError);
        results.push({ success: false, count: 0 });
      }
      
      if (i + batchSize < supabaseData.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    const totalSaved = results.reduce((sum, r) => sum + (r.success ? r.count : 0), 0);
    console.log(`💾 Saved ${totalSaved}/${emails.length} emails to database`);
    
    return results;
  } catch (error) {
    console.error("❌ Batch save error:", error);
    return [];
  }
}

// Authentication Middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: "Authentication required"
      });
    }

    const token = authHeader.substring(7);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Authentication service unavailable"
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user || !user.email) {
      return res.status(401).json({
        success: false,
        error: "Authentication failed"
      });
    }

    req.user = {
      email: user.email,
      id: user.id
    };
    
    next();
  } catch (error) {
    console.error("❌ Authentication error:", error);
    return res.status(401).json({
      success: false,
      error: "Authentication failed"
    });
  }
};

// Authorization Middleware
const authorizeEmailAccess = (accountId = null) => {
  return (req, res, next) => {
    try {
      const userEmail = req.user.email;
      const targetAccountId = accountId || req.body.accountId || req.query.accountId;
      
      if (!targetAccountId || targetAccountId === 'all') {
        const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
        if (allowedAccounts.length === 0) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
        return next();
      }
      
      if (!emailConfigManager.canUserAccessAccount(userEmail, targetAccountId)) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }
      
      next();
    } catch (error) {
      console.error("❌ Authorization error:", error);
      return res.status(403).json({
        success: false,
        error: "Authorization failed"
      });
    }
  };
};

// IMAP Connection Manager
class IMAPConnectionManager {
  constructor() {
    this.connections = new Map();
    this.connectionTimeouts = new Map();
  }

  async getConnection(configId) {
    if (this.connectionTimeouts.has(configId)) {
      clearTimeout(this.connectionTimeouts.get(configId));
    }

    if (this.connections.has(configId)) {
      const connection = this.connections.get(configId);
      if (await connection.checkConnection()) {
        this.connectionTimeouts.set(configId, setTimeout(() => {
          this.closeConnection(configId);
        }, 30000));
        return connection;
      }
      this.connections.delete(configId);
    }

    const config = emailConfigManager.getConfig(configId);
    if (!config) {
      throw new Error(`Email configuration ${configId} not found`);
    }

    const connection = new IMAPConnection(config);
    await connection.connect();
    this.connections.set(configId, connection);
    
    this.connectionTimeouts.set(configId, setTimeout(() => {
      this.closeConnection(configId);
    }, 30000));
    
    return connection;
  }

  closeConnection(configId) {
    if (this.connections.has(configId)) {
      const connection = this.connections.get(configId);
      connection.disconnect();
      this.connections.delete(configId);
    }
    if (this.connectionTimeouts.has(configId)) {
      clearTimeout(this.connectionTimeouts.get(configId));
      this.connectionTimeouts.delete(configId);
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
    if (this.isConnected && this.connection) return this.connection;

    return new Promise((resolve, reject) => {
      this.connection = new Imap({
        user: this.config.email,
        password: this.config.password,
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 30000,
        authTimeout: 15000,
        keepalive: false
      });

      this.connection.once('ready', () => {
        this.isConnected = true;
        resolve(this.connection);
      });

      this.connection.once('error', (err) => {
        this.isConnected = false;
        reject(err);
      });

      this.connection.once('end', () => {
        this.isConnected = false;
      });

      this.connection.connect();
    });
  }

  async disconnect() {
    if (this.connection && this.isConnected) {
      this.connection.end();
      this.isConnected = false;
    }
  }

  async checkConnection() {
    if (!this.connection || !this.isConnected) {
      return false;
    }
    
    return new Promise((resolve) => {
      try {
        this.connection.state;
        resolve(true);
      } catch (err) {
        this.isConnected = false;
        resolve(false);
      }
    });
  }

  openInbox(cb) {
    this.connection.openBox("INBOX", false, cb);
  }
}

const imapManager = new IMAPConnectionManager();

// ========== API ENDPOINTS ==========

// Health check
app.get("/api/health", async (req, res) => {
  try {
    let supabaseStatus = "not_configured";
    
    if (supabaseEnabled && supabase) {
      try {
        const { error } = await supabase.from('emails').select('message_id').limit(1);
        supabaseStatus = error ? "disconnected" : "connected";
      } catch (error) {
        supabaseStatus = "error";
      }
    }

    res.json({
      status: supabaseStatus === "connected" ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        supabase: { status: supabaseStatus },
        email_configs: { count: emailConfigManager.getAllConfigs().length }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Email Backend API is running!",
    timestamp: new Date().toISOString()
  });
});

// Get emails list (WITHOUT content)
app.get("/api/emails", authenticateUser, authorizeEmailAccess(), async (req, res) => {
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

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Database unavailable"
      });
    }

    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    const allowedAccountIds = allowedAccounts.map(acc => acc.id);
    
    if (allowedAccountIds.length === 0) {
      return res.status(403).json({
        success: false,
        error: "No accessible accounts"
      });
    }

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
        attachments,
        has_attachments,
        attachments_count,
        created_at
      `, { count: 'exact' });

    if (accountId !== "all") {
      const accountIdNum = parseInt(accountId);
      if (!emailConfigManager.canUserAccessAccount(userEmail, accountIdNum)) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }
      query = query.eq('account_id', accountIdNum);
    } else {
      query = query.in('account_id', allowedAccountIds);
    }

    if (search && search.trim().length > 0) {
      const trimmedSearch = search.trim();
      query = query.or(`subject.ilike.%${trimmedSearch}%,from_text.ilike.%${trimmedSearch}%,to_text.ilike.%${trimmedSearch}%`);
    }

    switch (sort) {
      case "date_asc":
        query = query.order('date', { ascending: true });
        break;
      case "subject_asc":
        query = query.order('subject', { ascending: true });
        break;
      case "subject_desc":
        query = query.order('subject', { ascending: false });
        break;
      default:
        query = query.order('date', { ascending: false });
    }

    query = query.range(skip, skip + limitNum - 1);

    const { data: emails, error, count } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: "Database query failed"
      });
    }

    const processedEmails = (emails || []).map(email => ({
      _id: email.id || email.message_id,
      id: email.id || email.message_id,
      messageId: email.message_id,
      message_id: email.message_id,
      subject: email.subject || '(No Subject)',
      from: email.from_text,
      from_text: email.from_text,
      to: email.to_text,
      to_text: email.to_text,
      date: email.date,
      attachments: Array.isArray(email.attachments) ? email.attachments : [],
      hasAttachments: email.has_attachments,
      attachmentsCount: email.attachments_count,
      account_id: email.account_id
    }));

    res.json({
      success: true,
      emails: processedEmails,
      total: count || 0,
      hasMore: skip + (emails?.length || 0) < (count || 0),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error("❌ Emails fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch emails"
    });
  }
});

// Get single email WITH content
app.get("/api/emails/:messageId", authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userEmail = req.user.email;

    if (!supabaseEnabled || !supabase) {
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

    if (!emailConfigManager.canUserAccessAccount(userEmail, email.account_id)) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    res.json({
      success: true,
      email: {
        _id: email.id || email.message_id,
        id: email.id || email.message_id,
        messageId: email.message_id,
        message_id: email.message_id,
        subject: email.subject || '(No Subject)',
        from: email.from_text,
        from_text: email.from_text,
        to: email.to_text,
        to_text: email.to_text,
        date: email.date,
        text: email.text_content,
        text_content: email.text_content,
        html: email.html_content,
        html_content: email.html_content,
        attachments: Array.isArray(email.attachments) ? email.attachments : [],
        hasAttachments: email.has_attachments,
        attachmentsCount: email.attachments_count,
        account_id: email.account_id
      }
    });

  } catch (error) {
    console.error("❌ Get email error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch email"
    });
  }
});

// ✅ CRITICAL FIX: Fetch emails endpoint - Properly gets NEWEST emails first
app.post("/api/fetch-emails", authenticateUser, authorizeEmailAccess(), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      mode = "latest", 
      count = 100,
      accountId = "all"
    } = req.body;
    
    const userEmail = req.user.email;
    const shouldFetchAll = count === "all";
    const fetchCount = shouldFetchAll ? null : Math.min(parseInt(count) || 100, 500);
    
    let accountsToProcess = [];
    
    if (accountId === "all") {
      accountsToProcess = emailConfigManager.getAllowedAccounts(userEmail);
    } else {
      if (!emailConfigManager.canUserAccessAccount(userEmail, accountId)) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
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

    if (accountsToProcess.length === 0) {
      return res.status(403).json({
        success: false,
        error: "No accessible accounts"
      });
    }

    console.log(`\n🚀 ========== FETCH STARTED ==========`);
    console.log(`   Accounts: ${accountsToProcess.length}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Count: ${shouldFetchAll ? 'ALL EMAILS' : fetchCount}`);
    console.log(`========================================\n`);
    
    const allResults = [];
    
    for (const account of accountsToProcess) {
      const accountStartTime = Date.now();
      console.log(`\n📧 ========== ACCOUNT ${account.id}: ${account.email} ==========`);
      
      try {
        const connection = await imapManager.getConnection(account.id);
        
        const accountResult = await new Promise((resolve) => {
          connection.openInbox(async function (err, box) {
            if (err) {
              console.error(`❌ Failed to open inbox:`, err.message);
              resolve({
                accountId: account.id,
                accountEmail: account.email,
                success: false,
                error: err.message
              });
              return;
            }
            
            const totalMessages = box.messages.total;
            console.log(`📊 Total messages in inbox: ${totalMessages}`);
            
            if (totalMessages === 0) {
              console.log(`📭 No messages in inbox`);
              resolve({
                accountId: account.id,
                accountEmail: account.email,
                success: true,
                message: "No messages in inbox",
                data: { processed: 0, duplicates: 0, total: 0, saved: 0 }
              });
              imapManager.closeConnection(account.id);
              return;
            }
            
            // ✅ CRITICAL FIX: Always fetch NEWEST emails first
            let fetchRange;
            if (shouldFetchAll) {
              // Fetch ALL emails but process newest first
              fetchRange = `1:${totalMessages}`;
            } else {
              // Fetch specific count of NEWEST emails
              const startSeq = Math.max(1, totalMessages - fetchCount + 1);
              fetchRange = `${startSeq}:${totalMessages}`;
            }

            console.log(`📨 FETCHING EMAILS`);
            console.log(`   Range: ${fetchRange}`);
            console.log(`   Total: ${totalMessages}`);
            console.log(`   Count: ${fetchCount || 'ALL'}`);
            console.log(`   Strategy: NEWEST FIRST`);

            const f = connection.connection.seq.fetch(fetchRange, { 
              bodies: "",
              struct: true,
              markSeen: false
            });

            const emailBuffers = [];

            f.on("message", function (msg, seqno) {
              let buffer = "";
              let currentSeqno = seqno;

              msg.on("body", function (stream) {
                stream.on("data", function (chunk) {
                  buffer += chunk.toString("utf8");
                });
              });

              msg.once("end", function () {
                emailBuffers.push({ buffer, seqno: currentSeqno });
              });
            });

            f.once("error", function (err) {
              console.error(`❌ Fetch error:`, err);
              resolve({
                accountId: account.id,
                accountEmail: account.email,
                success: false,
                error: err.message
              });
            });

            f.once("end", async function () {
              const fetchTime = Date.now() - accountStartTime;
              console.log(`⚡ Fetched ${emailBuffers.length} emails in ${fetchTime}ms`);
              
              // ✅ CRITICAL FIX: Sort by sequence number DESCENDING (newest first)
              emailBuffers.sort((a, b) => b.seqno - a.seqno);
              console.log(`📊 Sequence range: ${emailBuffers[emailBuffers.length - 1]?.seqno} to ${emailBuffers[0]?.seqno}`);
              console.log(`🔄 Processing order: NEWEST FIRST (highest seqno first)`);
              
              try {
                // Parse emails in parallel
                console.log(`🔄 Parsing ${emailBuffers.length} emails...`);
                const parseStartTime = Date.now();
                
                const parsedEmailsPromises = emailBuffers.map(async ({ buffer, seqno }) => {
                  try {
                    const parsed = await simpleParser(buffer);
                    const messageId = parsed.messageId || `email-${account.id}-${Date.now()}-${seqno}`;
                    return { parsed, messageId, seqno };
                  } catch (parseErr) {
                    console.error(`❌ Parse error for seqno ${seqno}:`, parseErr.message);
                    return null;
                  }
                });
                
                const parsedEmails = (await Promise.all(parsedEmailsPromises)).filter(e => e !== null);
                const parseTime = Date.now() - parseStartTime;
                console.log(`✅ Parsed ${parsedEmails.length} emails in ${parseTime}ms`);

                // Check duplicates (only in 'latest' mode)
                let newEmails = parsedEmails;
                let duplicateCount = 0;
                
                if (mode !== "force") {
                  const duplicateCheckStartTime = Date.now();
                  const messageIds = parsedEmails.map(e => e.messageId);
                  const duplicateResults = await checkDuplicatesBatch(messageIds, account.id);
                  
                  newEmails = parsedEmails.filter(e => !duplicateResults[e.messageId]);
                  duplicateCount = parsedEmails.length - newEmails.length;
                  
                  const duplicateCheckTime = Date.now() - duplicateCheckStartTime;
                  console.log(`✅ Duplicate check in ${duplicateCheckTime}ms: ${newEmails.length} new, ${duplicateCount} duplicates`);
                }

                // Process emails with attachments
                console.log(`🔄 Processing ${newEmails.length} emails...`);
                const processStartTime = Date.now();
                
                const processedEmailsPromises = newEmails.map(async ({ parsed, messageId, seqno }) => {
                  try {
                    return await processEmailWithAttachmentsFast(parsed, messageId, account.id, seqno);
                  } catch (processErr) {
                    console.error(`❌ Process error for ${messageId}:`, processErr.message);
                    return null;
                  }
                });
                
                const processedEmails = (await Promise.all(processedEmailsPromises)).filter(e => e !== null);
                const processTime = Date.now() - processStartTime;
                console.log(`✅ Processed ${processedEmails.length} emails in ${processTime}ms`);

                // Save to database
                const saveStartTime = Date.now();
                const saveResults = await saveEmailsBatch(processedEmails, 10);
                const saveTime = Date.now() - saveStartTime;
                const successfulSaves = saveResults.filter(r => r.success).reduce((sum, r) => sum + r.count, 0);
                console.log(`💾 Saved ${successfulSaves} emails in ${saveTime}ms`);

                const totalTime = Date.now() - accountStartTime;
                console.log(`✅ Account completed in ${totalTime}ms`);
                console.log(`========== ACCOUNT ${account.id} FINISHED ==========\n`);
                
                resolve({
                  accountId: account.id,
                  accountEmail: account.email,
                  success: true,
                  message: `Processed ${processedEmails.length} ${mode === 'force' ? '' : 'new '}emails`,
                  data: {
                    processed: processedEmails.length,
                    duplicates: duplicateCount,
                    total: processedEmails.length + duplicateCount,
                    saved: successfulSaves
                  },
                  timing: {
                    fetch: fetchTime,
                    parse: parseTime,
                    process: processTime,
                    save: saveTime,
                    total: totalTime
                  }
                });

              } catch (batchError) {
                console.error(`❌ Batch processing error:`, batchError);
                resolve({
                  accountId: account.id,
                  accountEmail: account.email,
                  success: false,
                  error: batchError.message
                });
              } finally {
                imapManager.closeConnection(account.id);
              }
            });
          });
        });

        allResults.push(accountResult);

      } catch (accountError) {
        console.error(`❌ Account processing error:`, accountError);
        allResults.push({
          accountId: account.id,
          accountEmail: account.email,
          success: false,
          error: accountError.message
        });
      }
    }

    clearCache();

    const successfulAccounts = allResults.filter(r => r.success);
    const totalProcessed = successfulAccounts.reduce((sum, r) => sum + (r.data?.processed || 0), 0);
    const totalTime = Date.now() - startTime;

    console.log(`\n🎉 ========== FETCH COMPLETED ==========`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Processed: ${totalProcessed} emails`);
    console.log(`   Successful accounts: ${successfulAccounts.length}/${accountsToProcess.length}`);
    console.log(`========================================\n`);

    res.json({
      success: true,
      message: `Processed ${accountsToProcess.length} accounts in ${totalTime}ms`,
      summary: {
        totalAccounts: accountsToProcess.length,
        successfulAccounts: successfulAccounts.length,
        totalProcessed,
        totalTimeMs: totalTime
      },
      accounts: allResults
    });

  } catch (error) {
    console.error("❌ Fetch emails error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Delete email
app.delete("/api/emails/:messageId", authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userEmail = req.user.email;

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Database unavailable"
      });
    }

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

    if (!emailConfigManager.canUserAccessAccount(userEmail, email.account_id)) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    if (email.attachments && Array.isArray(email.attachments)) {
      const deletePromises = email.attachments.map(async (attachment) => {
        if (attachment.path) {
          try {
            await supabase.storage.from('attachments').remove([attachment.path]);
          } catch (err) {
            console.error(`❌ Error deleting attachment:`, err);
          }
        }
      });
      
      await Promise.allSettled(deletePromises);
    }

    const { error: deleteError } = await supabase
      .from('emails')
      .delete()
      .eq('message_id', messageId);

    if (deleteError) {
      return res.status(500).json({
        success: false,
        error: "Failed to delete email"
      });
    }

    clearCache();

    res.json({
      success: true,
      message: "Email deleted successfully"
    });

  } catch (error) {
    console.error("❌ Delete email error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear cache
app.post("/api/clear-cache", (req, res) => {
  clearCache();
  res.json({ 
    success: true, 
    message: "Cache cleared" 
  });
});

// Get user accounts
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
      error: error.message
    });
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("🚨 Global error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

export default app;

// Start server in development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📧 Email accounts loaded: ${emailConfigManager.getAllConfigs().length}`);
    console.log(`🔐 Supabase enabled: ${supabaseEnabled}`);
    console.log(`\n👥 User mappings:`);
    Object.entries(USER_EMAIL_MAPPING).forEach(([email, accounts]) => {
      console.log(`   ${email} -> accounts ${accounts.join(', ')}`);
    });
  });
}