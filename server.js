import express from "express";
import cors from "cors";
import Imap from "imap";
import { simpleParser } from "mailparser";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from 'url';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Cache configuration
const cache = new Map();
const CACHE_TTL = 300000;
const MAX_CACHE_SIZE = 100;

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setToCache(key, data) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  
  cache.set(key, {
    data,
    timestamp: Date.now(),
    size: JSON.stringify(data).length
  });
}

function clearCache() {
  cache.clear();
}

// Supabase client
let supabase = null;
let supabaseEnabled = false;

const initializeSupabase = () => {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );
      
      supabaseEnabled = true;
      console.log("✅ Supabase client created successfully");
      return true;
    } else {
      console.error("❌ Supabase environment variables not set");
      supabaseEnabled = false;
      return false;
    }
  } catch (error) {
    console.error("❌ Failed to create Supabase client:", error.message);
    supabaseEnabled = false;
    return false;
  }
};

initializeSupabase();

// User-Email Mapping Configuration
const USER_EMAIL_MAPPING = {
  // Format: user_email: [allowed_email_account_ids]
  "info@seal.co.in": [1], // info@seal.co.in can only access account 1
  "pankaj.singh@seal.co.in": [2], // pankaj.singh@seal.co.in can only access account 2
  "admin@seal.co.in": [1, 2] // admin can access all accounts
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
      while (true) {
        const configKey = `EMAIL_CONFIG_${configIndex}`;
        const configValue = process.env[configKey];
        
        if (!configValue) break;

        const [email, password] = configValue.split(':');
        if (email && password) {
          this.configs.set(configIndex, {
            id: configIndex,
            email: email.trim(),
            password: password.trim(),
            name: `Account ${configIndex} (${email.trim()})`
          });
          console.log(`✅ Loaded email config ${configIndex}: ${email}`);
        }
        configIndex++;
      }

      console.log(`📧 Loaded ${this.configs.size} email configurations`);
    } catch (error) {
      console.error("❌ Error loading email configs:", error);
    }
  }

  getConfig(configId) {
    return this.configs.get(parseInt(configId));
  }

  getAllConfigs() {
    return Array.from(this.configs.values());
  }

  // Get allowed accounts for a user
  getAllowedAccounts(userEmail) {
    const allowedAccountIds = USER_EMAIL_MAPPING[userEmail] || [];
    return this.getAllConfigs().filter(config => 
      allowedAccountIds.includes(config.id)
    );
  }

  // Check if user can access account
  canUserAccessAccount(userEmail, accountId) {
    const allowedAccountIds = USER_EMAIL_MAPPING[userEmail] || [];
    return allowedAccountIds.includes(parseInt(accountId));
  }
}

const emailConfigManager = new EmailConfigManager();

// Authentication Middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: "Authentication required. Please log in."
      });
    }

    const token = authHeader.substring(7);
    
    if (!supabaseEnabled) {
      return res.status(500).json({
        success: false,
        error: "Authentication service unavailable"
      });
    }

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token. Please log in again."
      });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error("❌ Authentication error:", error);
    return res.status(401).json({
      success: false,
      error: "Authentication failed"
    });
  }
};

// Authorization Middleware for Email Accounts
const authorizeEmailAccess = (accountId = null) => {
  return (req, res, next) => {
    try {
      const userEmail = req.user.email;
      const targetAccountId = accountId || req.body.accountId || req.query.accountId;
      
      // If no specific account requested, check if user has any access
      if (!targetAccountId || targetAccountId === 'all') {
        const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
        if (allowedAccounts.length === 0) {
          return res.status(403).json({
            success: false,
            error: "Access denied. No email accounts assigned to your user."
          });
        }
        return next();
      }
      
      // Check specific account access
      if (!emailConfigManager.canUserAccessAccount(userEmail, targetAccountId)) {
        return res.status(403).json({
          success: false,
          error: "Access denied. You don't have permission to access this email account."
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

// Auth endpoints
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required"
      });
    }

    if (!supabaseEnabled) {
      return res.status(500).json({
        success: false,
        error: "Authentication service unavailable"
      });
    }

    // Sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password"
      });
    }

    // Check if user has access to any email accounts
    const allowedAccounts = emailConfigManager.getAllowedAccounts(email);
    if (allowedAccounts.length === 0) {
      return res.status(403).json({
        success: false,
        error: "Your account doesn't have access to any email accounts. Please contact administrator."
      });
    }

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: data.user,
        session: data.session,
        allowedAccounts: allowedAccounts
      }
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed"
    });
  }
});

app.post("/api/auth/logout", authenticateUser, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.substring(7);

    if (supabaseEnabled) {
      await supabase.auth.signOut();
    }

    res.json({
      success: true,
      message: "Logout successful"
    });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Logout failed"
    });
  }
});

app.get("/api/auth/profile", authenticateUser, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);

    res.json({
      success: true,
      data: {
        user: req.user,
        allowedAccounts: allowedAccounts
      }
    });
  } catch (error) {
    console.error("❌ Profile fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch profile"
    });
  }
});

// Email configuration endpoints
app.get("/api/email-configs", authenticateUser, (req, res) => {
  try {
    const userEmail = req.user.email;
    const allowedAccounts = emailConfigManager.getAllowedAccounts(userEmail);
    
    res.json({
      success: true,
      data: allowedAccounts
    });
  } catch (error) {
    console.error("❌ Get email configs error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Email fetching with authentication and authorization
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
      accounts: allResults
    });

  } catch (error) {
    console.error("❌ Fetch emails API error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get emails with authentication and authorization - FIXED VERSION
app.get("/api/emails", authenticateUser, authorizeEmailAccess(), async (req, res) => {
  try {
    const { 
      search = "", 
      sort = "date_desc", 
      page = 1, 
      limit = 20,
      accountId = "all"
    } = req.query;
    
    const userEmail = req.user.email;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    console.log(`📧 Fetching emails for user: ${userEmail}, account: ${accountId}`);

    const cacheKey = `emails:${userEmail}:${accountId}:${search}:${sort}:${pageNum}:${limitNum}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      console.log("📦 Serving from cache");
      return res.json(cached);
    }

    if (!supabaseEnabled || !supabase) {
      console.error("❌ Supabase not available");
      return res.status(500).json({ 
        success: false,
        error: "Supabase is not available" 
      });
    }

    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' });

    // Apply account filtering based on user access
    if (accountId !== "all") {
      if (!emailConfigManager.canUserAccessAccount(userEmail, accountId)) {
        console.error(`❌ Access denied: ${userEmail} cannot access account ${accountId}`);
        return res.status(403).json({
          success: false,
          error: "Access denied to this email account"
        });
      }
      query = query.eq('account_id', parseInt(accountId));
    } else {
      // Show only emails from accounts user has access to
      const allowedAccountIds = emailConfigManager.getAllowedAccounts(userEmail).map(acc => acc.id);
      console.log(`🔐 Allowed account IDs for ${userEmail}:`, allowedAccountIds);
      
      if (allowedAccountIds.length > 0) {
        query = query.in('account_id', allowedAccountIds);
      } else {
        console.log(`⚠️ No allowed accounts for user: ${userEmail}`);
        return res.json({
          success: true,
          emails: [],
          total: 0,
          hasMore: false,
          page: pageNum,
          limit: limitNum
        });
      }
    }
    
    // Add search if provided
    if (search && search.trim().length > 0) {
      query = query.or(`subject.ilike.%${search}%,from_text.ilike.%${search}%,text_content.ilike.%${search}%`);
    }
    
    // Add sorting
    if (sort === "date_asc") {
      query = query.order('date', { ascending: true });
    } else if (sort === "subject_asc") {
      query = query.order('subject', { ascending: true });
    } else if (sort === "subject_desc") {
      query = query.order('subject', { ascending: false });
    } else {
      query = query.order('date', { ascending: false });
    }
    
    // Add pagination
    query = query.range(skip, skip + limitNum - 1);
    
    console.log(`🔍 Executing Supabase query...`);
    const { data: emails, error, count } = await query;
    
    if (error) {
      console.error("❌ Supabase query error:", error);
      return res.status(500).json({ 
        success: false,
        error: "Failed to fetch emails from Supabase",
        details: error.message
      });
    }

    console.log(`✅ Found ${emails?.length || 0} emails`);

    const hasMore = skip + (emails?.length || 0) < (count || 0);

    const response = {
      success: true,
      emails: emails || [],
      total: count || 0,
      hasMore,
      page: pageNum,
      limit: limitNum
    };

    setToCache(cacheKey, response);
    res.json(response);

  } catch (error) {
    console.error("❌ Emails fetch error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch emails",
      details: error.message
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

    // First get the email to check account access
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

    // Check if user has access to this email's account
    if (!emailConfigManager.canUserAccessAccount(userEmail, email.account_id)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to delete this email"
      });
    }

    // Delete the email
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

// Health check
app.get("/api/health", async (req, res) => {
  try {
    let supabaseStatus = "not_configured";
    
    if (supabaseEnabled && supabase) {
      try {
        const { error } = await supabase
          .from('emails')
          .select('message_id')
          .limit(1);
        supabaseStatus = error ? "disconnected" : "connected";
      } catch {
        supabaseStatus = "error";
      }
    }

    res.json({
      status: "ok",
      services: {
        supabase: supabaseStatus
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
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

// Serve static files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down gracefully...');
  await imapManager.disconnectAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down gracefully...');
  await imapManager.disconnectAll();
  process.exit(0);
});

// Start server (for local development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📧 Email accounts loaded: ${emailConfigManager.getAllConfigs().length}`);
    console.log(`🔐 Authentication enabled`);
  });
}

// Export for Vercel
export default app;