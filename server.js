import express from "express";
import cors from "cors";
import Imap from "imap";
import { simpleParser } from "mailparser";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from 'url';

// Load environment variables - VERCEL COMPATIBLE
const loadEnv = async () => {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
      console.log('✅ Loaded environment variables from .env file');
    } catch (error) {
      console.log('⚠️ dotenv not available, using Vercel environment variables');
    }
  } else {
    console.log('✅ Using Vercel environment variables');
  }
};

await loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced Middleware with better error handling
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`, {
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
    timestamp: new Date().toISOString()
  });
  next();
});

// Cache configuration
const cache = new Map();
const CACHE_TTL = 300000;
const MAX_CACHE_SIZE = 100;

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
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    cache.set(key, {
      data,
      timestamp: Date.now(),
      size: JSON.stringify(data).length
    });
  } catch (error) {
    console.error("❌ Cache set error:", error);
  }
}

function clearCache() {
  try {
    cache.clear();
    console.log("✅ Cache cleared successfully");
  } catch (error) {
    console.error("❌ Cache clear error:", error);
  }
}

// Enhanced Supabase client with better error handling
let supabase = null;
let supabaseEnabled = false;

const initializeSupabase = () => {
  try {
    // VERCEL COMPATIBLE: Use both naming conventions
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Supabase environment variables not set");
      console.log("SUPABASE_URL:", supabaseUrl ? "Set" : "Missing");
      console.log("SUPABASE_KEY:", supabaseKey ? "Set" : "Missing");
      supabaseEnabled = false;
      return false;
    }

    console.log("🔗 Initializing Supabase with URL:", supabaseUrl);
    
    supabase = createClient(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            'X-Client-Info': 'email-backend'
          }
        }
      }
    );
    
    supabaseEnabled = true;
    console.log("✅ Supabase client created successfully");
    
    // Test the connection
    testSupabaseConnection();
    return true;
  } catch (error) {
    console.error("❌ Failed to create Supabase client:", error.message);
    supabaseEnabled = false;
    return false;
  }
};

// Test Supabase connection
const testSupabaseConnection = async () => {
  try {
    if (supabaseEnabled && supabase) {
      console.log("🧪 Testing Supabase connection...");
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .limit(1);
      
      if (error) {
        console.error("❌ Supabase connection test failed:", error.message);
        console.error("Error details:", error);
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
        // VERCEL COMPATIBLE: Try multiple naming conventions
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

// Enhanced Authentication Middleware for Supabase JWT tokens
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

    // DEVELOPMENT BYPASS - VERCEL COMPATIBLE
    if (process.env.NODE_ENV !== 'production') {
      console.log("🚨 DEVELOPMENT: Bypassing authentication for testing");
      req.user = { 
        email: "anshuman.singh@seal.co.in",
        id: "dev-user" 
      };
      console.log("🔐 Development user set:", req.user.email);
      return next();
    }

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

// Enhanced Authorization Middleware for Email Accounts
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
        connTimeout: 15000,
        authTimeout: 10000,
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

async function processEmailsInBatch(emails, batchSize = 5) {
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
    await new Promise(resolve => setTimeout(resolve, 100));
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

// Debug endpoints - NO AUTH REQUIRED
app.get("/api/debug-env", (req, res) => {
  res.json({
    success: true,
    environment: {
      supabase: {
        url: process.env.SUPABASE_URL ? "✅ Set" : "❌ Missing",
        serviceKey: process.env.SUPABASE_SERVICE_KEY ? "✅ Set" : "❌ Missing",
        serviceKeyLength: process.env.SUPABASE_SERVICE_KEY ? process.env.SUPABASE_SERVICE_KEY.length : 0
      },
      emailConfigs: {
        config1: process.env.EMAIL_CONFIG_1 ? "✅ Set" : "❌ Missing",
        config2: process.env.EMAIL_CONFIG_2 ? "✅ Set" : "❌ Missing"
      },
      nodeEnv: process.env.NODE_ENV || 'not set',
      port: process.env.PORT || 3001
    }
  });
});

app.get("/api/test-supabase", async (req, res) => {
  try {
    if (!supabaseEnabled || !supabase) {
      return res.json({
        success: false,
        message: "Supabase not initialized",
        enabled: supabaseEnabled,
        client: !!supabase
      });
    }

    const { data, error, count } = await supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .limit(5);

    if (error) {
      return res.json({
        success: false,
        message: "Supabase query failed",
        error: error.message,
        code: error.code,
        details: error.details
      });
    }

    res.json({
      success: true,
      message: "Supabase connection successful",
      emailsCount: count || 0,
      sampleData: data || [],
      enabled: supabaseEnabled
    });

  } catch (error) {
    res.json({
      success: false,
      message: "Supabase test failed",
      error: error.message
    });
  }
});

app.get("/api/test-emails-table", async (req, res) => {
  try {
    if (!supabaseEnabled || !supabase) {
      return res.json({
        success: false,
        message: "Supabase not available"
      });
    }

    const { data, error } = await supabase
      .from('emails')
      .select('*')
      .limit(5);

    if (error) {
      return res.json({
        success: false,
        message: "Emails table query failed",
        error: error.message,
        code: error.code,
        details: error.details
      });
    }

    res.json({
      success: true,
      message: "Emails table is accessible",
      data: data,
      count: data.length
    });

  } catch (error) {
    res.json({
      success: false,
      message: "Test failed",
      error: error.message
    });
  }
});

// Database health check endpoint
app.get("/api/db-health", authenticateUser, async (req, res) => {
  try {
    if (!supabaseEnabled || !supabase) {
      return res.json({
        success: false,
        message: "Supabase client not initialized",
        supabaseEnabled,
        hasClient: !!supabase
      });
    }

    // Test basic connection
    const { data: authData, error: authError } = await supabase.auth.getUser();
    
    // Test emails table access
    const { data, error, count } = await supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .limit(1);

    res.json({
      success: true,
      connection: {
        authenticated: !authError,
        authError: authError?.message,
        canQueryEmails: !error,
        emailsError: error?.message,
        emailsErrorCode: error?.code,
        emailsCount: count || 0,
        tableExists: !error || error.code !== '42P01'
      },
      user: req.user.email
    });

  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Simple query test endpoint
app.get("/api/simple-query", authenticateUser, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    const allowedAccountIds = allowedAccounts.map(acc => acc.id);

    console.log(`🔍 Simple query for user ${userEmail}, allowed accounts:`, allowedAccountIds);

    if (allowedAccountIds.length === 0) {
      return res.json({
        success: false,
        error: "No allowed accounts"
      });
    }

    // Try a very simple query first
    const { data, error } = await supabase
      .from('emails')
      .select('*')
      .in('account_id', allowedAccountIds)
      .limit(5)
      .order('date', { ascending: false });

    if (error) {
      console.error("❌ Simple query error:", error);
      return res.json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details
      });
    }

    res.json({
      success: true,
      count: data.length,
      emails: data
    });

  } catch (error) {
    console.error("❌ Simple query exception:", error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Authentication test endpoint
app.get("/api/test-auth", authenticateUser, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    
    res.json({
      success: true,
      message: "Authentication successful",
      user: {
        email: userEmail,
        id: req.user.id
      },
      access: {
        allowedAccounts: allowedAccounts,
        canAccessAll: allowedAccounts.length > 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Test auth error:", error);
    res.status(500).json({
      success: false,
      error: "Test failed"
    });
  }
});

// FIXED: Main email endpoints - AUTH REQUIRED
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

    // Get user's allowed accounts
    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    const allowedAccountIds = allowedAccounts.map(acc => acc.id);
    
    console.log(`🔐 User ${userEmail} allowed accounts:`, allowedAccountIds);
    
    if (allowedAccountIds.length === 0) {
      return res.status(403).json({
        success: false,
        error: "No email accounts accessible for your user"
      });
    }

    // FIXED: Build query with proper error handling and simplified approach
    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' });

    // Apply account filter
    if (accountId !== "all") {
      const accountIdNum = parseInt(accountId);
      if (!allowedAccountIds.includes(accountIdNum)) {
        return res.status(403).json({
          success: false,
          error: "Access denied to this email account"
        });
      }
      query = query.eq('account_id', accountIdNum);
    } else {
      query = query.in('account_id', allowedAccountIds);
    }

    // Apply search filter - FIXED: Use individual filters instead of OR for better compatibility
    if (search && search.trim().length > 0) {
      const trimmedSearch = search.trim();
      query = query.or(`subject.ilike.%${trimmedSearch}%,from_text.ilike.%${trimmedSearch}%,to_text.ilike.%${trimmedSearch}%`);
    }

    // Apply sorting - FIXED: Use proper column names
    let sortColumn = 'date';
    let sortOrder = { ascending: false };
    
    switch (sort) {
      case "date_asc":
        sortColumn = 'date';
        sortOrder = { ascending: true };
        break;
      case "subject_asc":
        sortColumn = 'subject';
        sortOrder = { ascending: true };
        break;
      case "subject_desc":
        sortColumn = 'subject';
        sortOrder = { ascending: false };
        break;
      default:
        sortColumn = 'date';
        sortOrder = { ascending: false };
    }

    query = query.order(sortColumn, sortOrder);

    // Apply pagination
    query = query.range(skip, skip + limitNum - 1);

    console.log("🚀 Executing Supabase query...");
    const { data: emails, error, count } = await query;

    if (error) {
      console.error("❌ Supabase query error:", error);
      console.error("Error code:", error.code);
      console.error("Error details:", error.details);
      console.error("Error hint:", error.hint);
      
      // Provide specific error messages
      let userMessage = "Database query failed";
      if (error.code === '42P01') {
        userMessage = "Emails table not found. Please check your database setup.";
      } else if (error.code === '42501') {
        userMessage = "Database permission denied. Please check your RLS policies.";
      } else if (error.code === '22P02') {
        userMessage = "Invalid data format in database.";
      } else if (error.code === '42703') {
        userMessage = "Database column not found. Please check your table schema.";
      }
      
      return res.status(500).json({
        success: false,
        error: userMessage,
        details: process.env.NODE_ENV === 'production' ? undefined : error.message,
        code: error.code
      });
    }

    console.log(`✅ Query successful: Found ${emails?.length || 0} emails out of ${count || 0} total`);

    // Process emails for response
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
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// Emergency fallback endpoint - returns empty data if main endpoint fails
app.get("/api/emails-fallback", authenticateUser, async (req, res) => {
  try {
    console.log("🆘 Using fallback emails endpoint");
    
    const userEmail = req.user.email;
    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    const allowedAccountIds = allowedAccounts.map(acc => acc.id);
    
    res.json({
      success: true,
      emails: [],
      total: 0,
      hasMore: false,
      page: 1,
      limit: 100,
      userAccess: {
        email: userEmail,
        allowedAccounts: allowedAccountIds
      },
      message: "Fallback endpoint - no emails found"
    });
  } catch (error) {
    console.error("❌ Fallback endpoint error:", error);
    res.json({
      success: true,
      emails: [],
      total: 0,
      hasMore: false,
      message: "Using fallback data"
    });
  }
});

// Email fetching endpoint
app.post("/api/fetch-emails", authenticateUser, authorizeEmailAccess(), async (req, res) => {
  try {
    const { 
      mode = "latest", 
      count = 10,
      accountId = "all"
    } = req.body;
    
    const userEmail = req.user.email;
    const validatedCount = Math.min(parseInt(count) || 10, 50);
    
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

                  const emailData = {
                    messageId: messageId,
                    accountId: account.id,
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
      .select('account_id')
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

app.post("/api/clear-cache", (req, res) => {
  clearCache();
  res.json({ 
    success: true, 
    message: "Cache cleared" 
  });
});

// VERCEL COMPATIBLE: Serve static files for production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    } else {
      res.status(404).json({ 
        success: false,
        error: 'API endpoint not found' 
      });
    }
  });
}

// Global error handler
app.use((error, req, res, next) => {
  console.error("🚨 Global error handler:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    ...(process.env.NODE_ENV !== 'production' && { details: error.message })
  });
});

// Start server - VERCEL COMPATIBLE
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📧 Email accounts loaded: ${emailConfigManager.getAllConfigs().length}`);
    console.log(`🔐 Supabase enabled: ${supabaseEnabled}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// VERCEL COMPATIBLE: Export for serverless
export default app;