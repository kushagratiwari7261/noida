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

// ✅ Enhanced CORS configuration
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
    origin: req.get('origin'),
    userAgent: req.get('User-Agent')?.substring(0, 50)
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

// Enhanced Supabase client
let supabase = null;
let supabaseEnabled = false;

const initializeSupabase = () => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Supabase environment variables not set");
      console.log("SUPABASE_URL:", supabaseUrl ? "Set" : "Missing");
      console.log("SUPABASE_KEY:", supabaseKey ? "Set" : "Missing");
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
    
    // Test connection
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

// Enhanced Email Configuration Manager
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
            console.warn("⚠️ No email configurations found in environment variables");
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
        } else {
          console.error(`❌ Invalid email configuration format for ${configKey}`);
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
    if (isNaN(id)) {
      console.error(`❌ Invalid config ID: ${configId}`);
      return null;
    }
    return this.configs.get(id);
  }

  getAllConfigs() {
    return Array.from(this.configs.values());
  }

  getAllowedAccounts(userEmail) {
    try {
      const allowedAccountIds = USER_EMAIL_MAPPING[userEmail] || [];
      console.log(`🔐 User ${userEmail} allowed accounts:`, allowedAccountIds);
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
      const canAccess = allowedAccountIds.includes(accountIdNum);
      console.log(`🔐 Access check: ${userEmail} -> account ${accountId}: ${canAccess}`);
      return canAccess;
    } catch (error) {
      console.error("❌ Error checking account access:", error);
      return false;
    }
  }
}

const emailConfigManager = new EmailConfigManager();

// ✅ Function to upload attachments to Supabase storage
async function uploadAttachmentToSupabase(attachment, messageId, accountId) {
  try {
    if (!supabaseEnabled || !supabase) {
      console.error("❌ Supabase not available for attachment upload");
      return null;
    }

    const fileExtension = attachment.filename ? 
      path.extname(attachment.filename) : '.bin';
    const uniqueFilename = `${messageId}_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;
    const filePath = `account_${accountId}/${uniqueFilename}`;

    console.log(`📎 Uploading attachment: ${attachment.filename} -> ${filePath}`);

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

    console.log(`✅ Attachment uploaded successfully: ${publicUrl}`);

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

// ✅ Function to process email with attachments
async function processEmailWithAttachments(parsed, messageId, accountId, seqno) {
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
      console.log(`📎 Processing ${parsed.attachments.length} attachments for email ${messageId}`);
      
      const attachmentPromises = parsed.attachments.map(async (attachment, index) => {
        try {
          if (attachment.content) {
            const attachmentInfo = await uploadAttachmentToSupabase(
              attachment, 
              messageId, 
              accountId
            );
            
            if (attachmentInfo) {
              return {
                filename: attachment.filename || `attachment_${index + 1}`,
                url: attachmentInfo.url,
                size: attachment.size || attachment.content.length || 0,
                contentType: attachment.contentType || 'application/octet-stream',
                path: attachmentInfo.path,
                accountId: accountId,
                messageId: messageId
              };
            }
          } else {
            console.log(`⚠️ Attachment ${index} has no content:`, attachment.filename);
          }
          return null;
        } catch (attachmentError) {
          console.error(`❌ Error processing attachment ${index}:`, attachmentError);
          return null;
        }
      });

      const attachmentResults = await Promise.all(attachmentPromises);
      const successfulAttachments = attachmentResults.filter(att => att !== null);
      
      emailData.attachments = successfulAttachments;
      emailData.hasAttachments = successfulAttachments.length > 0;
      emailData.attachmentsCount = successfulAttachments.length;
      
      console.log(`✅ Successfully processed ${successfulAttachments.length}/${parsed.attachments.length} attachments`);
    } else {
      console.log(`ℹ️ No attachments found for email ${messageId}`);
    }

    return emailData;
  } catch (error) {
    console.error("❌ Error processing email with attachments:", error);
    throw error;
  }
}

// ✅ FIXED: Enhanced Authentication Middleware (NO DEVELOPMENT BYPASS)
const authenticateUser = async (req, res, next) => {
  try {
    console.log("🔐 Starting authentication for:", req.method, req.path);
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.log("❌ No authorization header");
      return res.status(401).json({
        success: false,
        error: "Authentication required. Please log in."
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.log("❌ Invalid authorization format");
      return res.status(401).json({
        success: false,
        error: "Invalid authentication format. Use Bearer token."
      });
    }

    const token = authHeader.substring(7);
    
    if (!token || token.length < 10) {
      console.log("❌ Token too short or empty");
      return res.status(401).json({
        success: false,
        error: "Invalid authentication token."
      });
    }
    
    console.log("🔐 Token received, length:", token.length);

    if (!supabaseEnabled || !supabase) {
      console.error("❌ Supabase not available for authentication");
      return res.status(500).json({
        success: false,
        error: "Authentication service unavailable"
      });
    }

    console.log("🔐 Verifying token with Supabase...");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error("❌ Supabase token verification failed:", error.message);
      return res.status(401).json({
        success: false,
        error: "Authentication failed. Please log in again.",
        details: error.message
      });
    }

    if (!user || !user.email) {
      console.log("❌ No user found for token");
      return res.status(401).json({
        success: false,
        error: "User not found. Please log in again."
      });
    }

    console.log(`✅ Authenticated user: ${user.email} (${user.id})`);
    
    req.user = {
      email: user.email,
      id: user.id
    };
    
    next();
  } catch (error) {
    console.error("❌ Authentication process error:", error);
    return res.status(401).json({
      success: false,
      error: "Authentication failed",
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
};

// Enhanced Authorization Middleware
const authorizeEmailAccess = (accountId = null) => {
  return (req, res, next) => {
    try {
      const userEmail = req.user.email;
      const targetAccountId = accountId || req.body.accountId || req.query.accountId;
      
      console.log(`🔐 Authorization check for ${userEmail}, account: ${targetAccountId}`);
      
      if (!targetAccountId || targetAccountId === 'all') {
        const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
        if (allowedAccounts.length === 0) {
          console.log(`❌ User ${userEmail} has no allowed accounts`);
          return res.status(403).json({
            success: false,
            error: "Access denied. No email accounts assigned to your user."
          });
        }
        console.log(`✅ User ${userEmail} authorized for accounts:`, allowedAccounts.map(a => a.id));
        return next();
      }
      
      if (!emailConfigManager.canUserAccessAccount(userEmail, targetAccountId)) {
        console.log(`❌ User ${userEmail} not authorized for account ${targetAccountId}`);
        return res.status(403).json({
          success: false,
          error: "Access denied. You don't have permission to access this email account."
        });
      }
      
      console.log(`✅ User ${userEmail} authorized for account ${targetAccountId}`);
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

  async disconnectAll() {
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
        keepAlive: false
      });

      this.connection.once('ready', () => {
        this.isConnected = true;
        console.log(`✅ IMAP connection ready for ${this.config.email}`);
        resolve(this.connection);
      });

      this.connection.once('error', (err) => {
        this.isConnected = false;
        console.error(`❌ IMAP connection error for ${this.config.email}:`, err.message);
        reject(err);
      });

      this.connection.once('end', () => {
        this.isConnected = false;
        console.log(`📤 IMAP connection closed for ${this.config.email}`);
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

// Helper functions
async function checkDuplicate(messageId, accountId) {
  const cacheKey = `duplicate:${messageId}:${accountId}`;
  const cached = getFromCache(cacheKey);
  if (cached !== null) return cached;

  try {
    if (supabaseEnabled && supabase) {
      const { data, error } = await supabase
        .from('emails')
        .select('message_id')
        .eq('message_id', messageId)
        .eq('account_id', accountId)
        .limit(1);

      const isDuplicate = !error && data && data.length > 0;
      setToCache(cacheKey, isDuplicate);
      return isDuplicate;
    }
    return false;
  } catch (error) {
    console.error("❌ Duplicate check error:", error);
    return false;
  }
}

async function processEmailsInBatch(emails, batchSize = 3) {
  const batches = [];
  for (let i = 0; i < emails.length; i += batchSize) {
    batches.push(emails.slice(i, i + batchSize));
  }

  const results = [];
  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(email => saveEmailToSupabase(email))
    );
    results.push(...batchResults);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

async function saveEmailToSupabase(email) {
  try {
    if (!supabaseEnabled || !supabase) return false;

    const supabaseData = {
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
    };

    const { error } = await supabase.from('emails').upsert(supabaseData);
    if (error) {
      console.error("❌ Supabase save error:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("❌ Error saving email:", error);
    return false;
  }
}

// ========== API ENDPOINTS ==========

// Health check - NO AUTH REQUIRED
app.get("/api/health", async (req, res) => {
  try {
    let supabaseStatus = "not_configured";
    let supabaseDetails = {};
    
    if (supabaseEnabled && supabase) {
      try {
        const startTime = Date.now();
        const { data, error } = await supabase
          .from('emails')
          .select('message_id')
          .limit(1);
        const responseTime = Date.now() - startTime;

        if (error) {
          supabaseStatus = "disconnected";
          supabaseDetails = {
            error: error.message,
            code: error.code
          };
        } else {
          supabaseStatus = "connected";
          supabaseDetails = {
            responseTime: `${responseTime}ms`,
            canQuery: true
          };
        }
      } catch (error) {
        supabaseStatus = "error";
        supabaseDetails = {
          error: error.message
        };
      }
    }

    const healthStatus = supabaseStatus === "connected" ? "healthy" : "degraded";

    res.json({
      status: healthStatus,
      timestamp: new Date().toISOString(),
      services: {
        supabase: {
          status: supabaseStatus,
          enabled: supabaseEnabled,
          ...supabaseDetails
        },
        email_configs: {
          count: emailConfigManager.getAllConfigs().length,
          loaded: emailConfigManager.getAllConfigs().length > 0
        }
      },
      environment: process.env.NODE_ENV || 'development',
      platform: "Vercel Serverless"
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
    message: "Email Backend API is running!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: "/api/health",
      emails: "/api/emails (requires auth)",
      fetch_emails: "/api/fetch-emails (requires auth)"
    }
  });
});

// Debug endpoints
app.get("/api/debug-env", (req, res) => {
  res.json({
    success: true,
    environment: {
      nodeEnv: process.env.NODE_ENV || 'not set',
      port: process.env.PORT || 3001,
      supabase: {
        url: process.env.SUPABASE_URL ? "✅ Set" : "❌ Missing",
        serviceKey: process.env.SUPABASE_SERVICE_KEY ? "✅ Set" : "❌ Missing"
      },
      emailConfigs: {
        config1: process.env.EMAIL_CONFIG_1 ? "✅ Set" : "❌ Missing",
        config2: process.env.EMAIL_CONFIG_2 ? "✅ Set" : "❌ Missing"
      }
    }
  });
});

// ✅ FIXED: Main email endpoints with better error handling
app.get("/api/emails", authenticateUser, authorizeEmailAccess(), async (req, res) => {
  console.log("🚀 /api/emails endpoint called");
  
  try {
    const {
      search = "",
      sort = "date_desc",
      page = 1,
      limit = 100,
      accountId = "all"
    } = req.query;

    const userEmail = req.user.email;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    console.log(`📧 Fetching emails for user: ${userEmail}`, {
      accountId,
      search,
      sort,
      page: pageNum,
      limit: limitNum,
      skip
    });

    if (!supabaseEnabled || !supabase) {
      console.error("❌ Supabase not available");
      return res.status(500).json({
        success: false,
        error: "Database service is currently unavailable."
      });
    }

    // Get allowed accounts for the authenticated user
    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    const allowedAccountIds = allowedAccounts.map(acc => acc.id);
    
    console.log(`🔐 User ${userEmail} has access to accounts:`, allowedAccountIds);
    
    if (allowedAccountIds.length === 0) {
      console.log(`❌ No allowed accounts found for ${userEmail}`);
      return res.status(403).json({
        success: false,
        error: "No email accounts accessible for your user",
        userEmail: userEmail,
        allowedAccounts: []
      });
    }

    // Build query
    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' });

    // Apply account filter
    if (accountId !== "all") {
      const accountIdNum = parseInt(accountId);
      if (!emailConfigManager.canUserAccessAccount(userEmail, accountIdNum)) {
        console.log(`❌ Access denied: ${userEmail} cannot access account ${accountIdNum}`);
        return res.status(403).json({
          success: false,
          error: "Access denied to this email account",
          requestedAccount: accountIdNum,
          allowedAccounts: allowedAccountIds
        });
      }
      query = query.eq('account_id', accountIdNum);
      console.log(`📌 Filtering by account: ${accountIdNum}`);
    } else {
      query = query.in('account_id', allowedAccountIds);
      console.log(`📌 Filtering by accounts: ${allowedAccountIds.join(', ')}`);
    }

    // Apply search filter
    if (search && search.trim().length > 0) {
      const trimmedSearch = search.trim();
      console.log(`🔍 Applying search filter: "${trimmedSearch}"`);
      query = query.or(`subject.ilike.%${trimmedSearch}%,from_text.ilike.%${trimmedSearch}%,to_text.ilike.%${trimmedSearch}%`);
    }

    // Apply sorting
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

    // Apply pagination
    query = query.range(skip, skip + limitNum - 1);

    console.log("🚀 Executing Supabase query...");
    console.log("📊 Query parameters:", { skip, limitNum, sort, search: search || 'none' });
    
    const { data: emails, error, count } = await query;

    if (error) {
      console.error("❌ Supabase query error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      
      let userMessage = "Database query failed";
      let statusCode = 500;
      
      if (error.code === '42P01') {
        userMessage = "Emails table not found. Please check your database setup.";
      } else if (error.code === '42501') {
        userMessage = "Database permission denied. Please check your RLS policies.";
        statusCode = 403;
      } else if (error.code === 'PGRST116') {
        userMessage = "No data found or access denied.";
        statusCode = 404;
      }
      
      return res.status(statusCode).json({
        success: false,
        error: userMessage,
        details: process.env.NODE_ENV === 'production' ? undefined : {
          message: error.message,
          code: error.code,
          hint: error.hint
        },
        debugInfo: {
          userEmail,
          allowedAccounts: allowedAccountIds,
          requestedAccount: accountId
        }
      });
    }

    console.log(`✅ Query successful: Found ${emails?.length || 0} emails out of ${count || 0} total`);

    // Process emails
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
      text: email.text_content,
      text_content: email.text_content,
      html: email.html_content,
      html_content: email.html_content,
      attachments: Array.isArray(email.attachments) ? email.attachments : [],
      hasAttachments: email.has_attachments || (Array.isArray(email.attachments) && email.attachments.length > 0),
      attachmentsCount: email.attachments_count || (Array.isArray(email.attachments) ? email.attachments.length : 0),
      account_id: email.account_id
    }));

    const hasMore = skip + (emails?.length || 0) < (count || 0);
    
    const response = {
      success: true,
      emails: processedEmails,
      total: count || 0,
      hasMore,
      page: pageNum,
      limit: limitNum,
      userAccess: {
        email: userEmail,
        allowedAccounts: allowedAccountIds
      }
    };

    console.log(`📨 Sending response with ${processedEmails.length} emails`);
    res.json(response);

  } catch (error) {
    console.error("❌ Emails fetch error:", error);
    console.error("Error stack:", error.stack);
    
    res.status(500).json({
      success: false,
      error: "Failed to fetch emails from database",
      details: process.env.NODE_ENV === 'production' ? undefined : error.message,
      debugInfo: {
        userEmail: req.user?.email || 'unknown',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Email fetching endpoint with attachment processing
app.post("/api/fetch-emails", authenticateUser, authorizeEmailAccess(), async (req, res) => {
  try {
    const { 
      mode = "latest", 
      count = 10,
      accountId = "all"
    } = req.body;
    
    const userEmail = req.user.email;
    const validatedCount = Math.min(parseInt(count) || 10, 20);
    
    let accountsToProcess = [];
    
    if (accountId === "all") {
      accountsToProcess = emailConfigManager.getAllowedAccounts(userEmail);
    } else {
      if (!emailConfigManager.canUserAccessAccount(userEmail, accountId)) {
        return res.status(403).json({
          success: false,
          error: "Access denied to this email account"
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
        error: "No email accounts accessible"
      });
    }

    const allResults = [];
    
    for (const account of accountsToProcess) {
      console.log(`📧 Processing account ${account.id} for user ${userEmail}`);
      
      try {
        const connection = await imapManager.getConnection(account.id);
        
        const accountResult = await new Promise((resolve) => {
          connection.openInbox(async function (err, box) {
            if (err) {
              console.error(`❌ Failed to open inbox for ${account.email}:`, err.message);
              resolve({
                accountId: account.id,
                accountEmail: account.email,
                success: false,
                error: "Failed to open inbox: " + err.message
              });
              return;
            }
            
            const totalMessages = box.messages.total;
            const fetchCount = Math.min(validatedCount, totalMessages);
            const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
            const fetchEnd = totalMessages;
            const fetchRange = `${fetchStart}:${fetchEnd}`;

            console.log(`📨 Fetching ${fetchCount} emails for ${account.email}`);

            const f = connection.connection.seq.fetch(fetchRange, { 
              bodies: "",
              struct: true 
            });

            let processedCount = 0;
            let duplicateCount = 0;
            let newEmails = [];

            f.on("message", function (msg, seqno) {
              let buffer = "";

              msg.on("body", function (stream) {
                stream.on("data", function (chunk) {
                  buffer += chunk.toString("utf8");
                });
              });

              msg.once("end", async function () {
                try {
                  const parsed = await simpleParser(buffer);
                  const messageId = parsed.messageId || `email-${account.id}-${Date.now()}-${seqno}`;

                  if (mode !== "force") {
                    const isDuplicate = await checkDuplicate(messageId, account.id);
                    if (isDuplicate) {
                      duplicateCount++;
                      return;
                    }
                  }

                  const emailData = await processEmailWithAttachments(
                    parsed, 
                    messageId, 
                    account.id, 
                    seqno
                  );

                  newEmails.push(emailData);
                  processedCount++;

                } catch (parseErr) {
                  console.error("   ❌ Parse error:", parseErr.message);
                }
              });
            });

            f.once("error", function (err) {
              console.error(`❌ Fetch error for ${account.email}:`, err);
              resolve({
                accountId: account.id,
                accountEmail: account.email,
                success: false,
                error: "Fetch error: " + err.message
              });
            });

            f.once("end", async function () {
              console.log(`🔄 Processing ${newEmails.length} new emails for ${account.email}...`);
              
              try {
                if (newEmails.length > 0) {
                  const saveResults = await processEmailsInBatch(newEmails);
                  const successfulSaves = saveResults.filter(r => r.status === 'fulfilled' && r.value).length;
                  console.log(`💾 Saved ${successfulSaves}/${newEmails.length} emails to Supabase`);
                }

                console.log(`✅ Fetch completed for ${account.email}: ${processedCount} new, ${duplicateCount} duplicates`);
                
                resolve({
                  accountId: account.id,
                  accountEmail: account.email,
                  success: true,
                  message: `Processed ${processedCount} new emails`,
                  data: {
                    processed: processedCount,
                    duplicates: duplicateCount,
                    total: processedCount + duplicateCount
                  }
                });

              } catch (batchError) {
                console.error(`❌ Batch processing error for ${account.email}:`, batchError);
                resolve({
                  accountId: account.id,
                  accountEmail: account.email,
                  success: false,
                  error: "Batch processing failed: " + batchError.message
                });
              } finally {
                imapManager.closeConnection(account.id);
              }
            });
          });
        });

        allResults.push(accountResult);

      } catch (accountError) {
        console.error(`❌ Account processing error for ${account.email}:`, accountError);
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

    res.json({
      success: true,
      message: `Processed ${accountsToProcess.length} accounts`,
      summary: {
        totalAccounts: accountsToProcess.length,
        successfulAccounts: successfulAccounts.length,
        totalProcessed
      },
      accounts: allResults,
      userAccess: {
        email: userEmail,
        allowedAccounts: accountsToProcess.map(acc => acc.id)
      }
    });

  } catch (error) {
    console.error("❌ Fetch emails API error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Delete email with authorization
app.delete("/api/emails/:messageId", authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userEmail = req.user.email;

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase is not available"
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
        error: "Access denied to delete this email"
      });
    }

    // Delete attachments from storage before deleting email
    if (email.attachments && Array.isArray(email.attachments)) {
      const deletePromises = email.attachments.map(async (attachment) => {
        if (attachment.path) {
          try {
            const { error: deleteError } = await supabase.storage
              .from('attachments')
              .remove([attachment.path]);
            
            if (deleteError) {
              console.error(`❌ Failed to delete attachment ${attachment.path}:`, deleteError);
            } else {
              console.log(`✅ Deleted attachment: ${attachment.path}`);
            }
          } catch (attachmentError) {
            console.error(`❌ Error deleting attachment ${attachment.path}:`, attachmentError);
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
      message: "Email and attachments deleted successfully"
    });

  } catch (error) {
    console.error("❌ Delete email error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear cache endpoint
app.post("/api/clear-cache", (req, res) => {
  clearCache();
  res.json({ 
    success: true, 
    message: "Cache cleared" 
  });
});

// Get user accounts endpoint
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
  console.error("🚨 Global error handler:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    ...(process.env.NODE_ENV !== 'production' && { details: error.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/emails (auth required)',
      'POST /api/fetch-emails (auth required)',
      'GET /api/user-accounts (auth required)',
      'DELETE /api/emails/:messageId (auth required)'
    ]
  });
});

export default app;

// Only start server in development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`🌐 Accessible from other devices at: http://YOUR_LOCAL_IP:${PORT}`);
    console.log(`📧 Email accounts loaded: ${emailConfigManager.getAllConfigs().length}`);
    console.log(`🔐 Supabase enabled: ${supabaseEnabled}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`\n👥 User mappings:`);
    Object.entries(USER_EMAIL_MAPPING).forEach(([email, accounts]) => {
      console.log(`   ${email} -> accounts ${accounts.join(', ')}`);
    });
  });
}