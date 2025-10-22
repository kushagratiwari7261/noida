import express from "express";
import cors from "cors";
import Imap from "imap";
import { simpleParser } from "mailparser";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from 'url';

// Load environment variables locally (not needed in Vercel)
if (process.env.NODE_ENV !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

// ES module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

// FIXED: Enhanced Supabase client initialization
let supabase = null;
let supabaseEnabled = false;

const initializeSupabase = () => {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      console.log("🔧 Initializing Supabase client...");
      
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

// Initialize Supabase immediately
initializeSupabase();

// ========== MULTI-EMAIL SUPPORT ==========

// Function to parse multiple email configurations from environment
function getEmailConfigsFromEnv() {
  const configs = {};
  
  // Parse multiple email configurations
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('EMAIL_CONFIG_')) {
      const [email, password] = value.split(':');
      if (email && password) {
        configs[email.trim()] = password.trim();
      }
    }
  }
  
  // Also support legacy single email config for backward compatibility
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    configs[process.env.EMAIL_USER] = process.env.EMAIL_PASS;
  }
  
  console.log(`📧 Loaded ${Object.keys(configs).length} email configurations:`);
  Object.keys(configs).forEach(email => {
    console.log(`   ✅ ${email}`);
  });
  
  return configs;
}

// Initialize email configs
const emailConfigs = getEmailConfigsFromEnv();

// Enhanced IMAP Connection Manager for multiple users
class IMAPConnectionManager {
  constructor() {
    this.connections = new Map(); // Store connections by user ID
  }

  async getUserConnection(userId, userEmail) {
    // Check if user's email has configuration
    if (!emailConfigs[userEmail]) {
      throw new Error(`No email configuration found for ${userEmail}`);
    }

    // Return existing connection if available and valid
    if (this.connections.has(userId)) {
      const existingConnection = this.connections.get(userId);
      if (await existingConnection.checkConnection()) {
        return existingConnection;
      }
      // Remove stale connection
      this.connections.delete(userId);
    }

    // Create new connection
    const newConnection = new UserIMAPConnection(userId, userEmail, emailConfigs[userEmail]);
    this.connections.set(userId, newConnection);
    await newConnection.connect();
    return newConnection;
  }

  disconnectUser(userId) {
    if (this.connections.has(userId)) {
      this.connections.get(userId).disconnect();
      this.connections.delete(userId);
    }
  }
}

class UserIMAPConnection {
  constructor(userId, userEmail, password) {
    this.userId = userId;
    this.userEmail = userEmail;
    this.password = password;
    this.connection = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 2000;
  }

  async connect() {
    if (this.isConnected && this.connection) return this.connection;
    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        const checkConnection = setInterval(() => {
          if (this.isConnected) {
            clearInterval(checkConnection);
            resolve(this.connection);
          }
          if (!this.isConnecting) {
            clearInterval(checkConnection);
            reject(new Error('Connection failed'));
          }
        }, 100);
      });
    }

    this.isConnecting = true;
    
    return new Promise((resolve, reject) => {
      this.connection = new Imap({
        user: this.userEmail,
        password: this.password,
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 30000,
        authTimeout: 15000,
        keepAlive: true
      });

      this.connection.once('ready', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log(`✅ IMAP connection ready for user: ${this.userEmail}`);
        resolve(this.connection);
      });

      this.connection.once('error', (err) => {
        this.isConnecting = false;
        this.isConnected = false;
        console.error(`❌ IMAP connection error for user ${this.userEmail}:`, err.message);
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} for ${this.userEmail}`);
          setTimeout(() => {
            this.connect().then(resolve).catch(reject);
          }, this.reconnectDelay);
        } else {
          reject(err);
        }
      });

      this.connection.once('end', () => {
        this.isConnected = false;
        console.log(`📤 IMAP connection closed for user: ${this.userEmail}`);
      });

      this.connection.on('close', (hadError) => {
        this.isConnected = false;
        console.log(`🔒 IMAP connection closed ${hadError ? 'with error' : 'normally'} for user: ${this.userEmail}`);
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
    this.connection.openBox("INBOX", true, cb);
  }
}

// Initialize the multi-user manager
const imapManager = new IMAPConnectionManager();

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Check if user's email has configuration
    if (!emailConfigs[user.email]) {
      return res.status(403).json({ 
        error: `No email configuration found for ${user.email}. Please contact administrator.` 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

// ✅ UPDATED: Check duplicate using user_id
async function checkDuplicate(userId, messageId) {
  try {
    if (supabaseEnabled && supabase) {
      const { data, error } = await supabase
        .from('emails')
        .select('message_id')
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .single();

      if (!error && data) return true;
    }
    return false;
  } catch (error) {
    console.error("❌ Duplicate check error:", error);
    return false;
  }
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setToCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

function clearCache() {
  cache.clear();
}

// FIXED: Enhanced storage setup
async function ensureStorageBucket() {
  try {
    console.log("🛠️ Ensuring storage bucket exists and is public...");

    if (!supabaseEnabled || !supabase) {
      console.log("⚠️ Supabase not available");
      return false;
    }

    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error("❌ Cannot list buckets:", bucketsError.message);
      return false;
    }

    const attachmentsBucket = buckets?.find(b => b.name === 'attachments');

    if (!attachmentsBucket) {
      console.log("📦 Creating attachments bucket...");
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('attachments', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/*', 'application/pdf', 'text/*', 'application/*', 'audio/*', 'video/*']
      });

      if (createError) {
        console.error("❌ Failed to create bucket:", createError.message);
        return false;
      }
      console.log("✅ Created attachments bucket");
    } else {
      console.log("✅ Attachments bucket exists");
    }

    return true;

  } catch (error) {
    console.error("❌ Storage setup failed:", error.message);
    return false;
  }
}

// Helper function to identify problematic files
function isProblematicFile(filename, contentType) {
  if (!filename) return false;
  
  const lowerFilename = filename.toLowerCase();
  const lowerContentType = (contentType || '').toLowerCase();
  
  // Skip tracking pixels and analytics files
  const problematicPatterns = [
    /tracking/i,
    /pixel/i,
    /beacon/i,
    /analytics/i,
    /spacer/i,
    /forward/i,
    /gem\.gif$/i,
    /native_forward\.gif$/i,
    /\.gif$/i,
    /signature/i
  ];
  
  return problematicPatterns.some(pattern => 
    pattern.test(lowerFilename) || pattern.test(lowerContentType)
  );
}

// FIXED: Enhanced attachment processing
async function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) {
    console.log("📎 No attachments found");
    return [];
  }

  console.log(`📎 Processing ${attachments.length} attachments`);
  
  if (!supabaseEnabled || !supabase) {
    console.log("⚠️ Supabase not available, skipping attachments");
    return [];
  }

  const storageReady = await ensureStorageBucket();
  if (!storageReady) {
    console.error("❌ Storage not ready");
    return [];
  }

  const attachmentPromises = attachments.map(async (att, index) => {
    try {
      if (isProblematicFile(att.filename, att.contentType)) {
        console.log(`   🚫 Skipping problematic file: ${att.filename}`);
        return null;
      }

      if (!att.content) {
        console.log(`   ❌ Attachment ${index + 1} has no content`);
        return null;
      }

      const originalFilename = att.filename || `attachment_${Date.now()}_${index}.bin`;
      const safeFilename = originalFilename
        .replace(/[^a-zA-Z0-9.\-_]/g, '_')
        .substring(0, 100);

      // Create unique path with timestamp
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const uniquePath = `emails/${timestamp}_${randomId}_${safeFilename}`;

      console.log(`   📤 Uploading: ${safeFilename} -> ${uniquePath}`);

      // Convert to Buffer
      let contentBuffer;
      if (Buffer.isBuffer(att.content)) {
        contentBuffer = att.content;
      } else if (typeof att.content === 'string') {
        contentBuffer = Buffer.from(att.content, 'utf8');
      } else {
        contentBuffer = Buffer.from(att.content);
      }

      // Skip if file is too small (likely tracking pixel)
      if (contentBuffer.length < 100) {
        console.log(`   🚫 Skipping small file: ${safeFilename}`);
        return null;
      }

      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from("attachments")
        .upload(uniquePath, contentBuffer, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600'
        });

      if (error) {
        console.error(`   ❌ Upload failed for ${safeFilename}:`, error.message);
        return null;
      }

      console.log(`   ✅ Upload successful: ${safeFilename}`);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(data.path);

      const attachmentResult = {
        id: `att_${timestamp}_${index}_${randomId}`,
        filename: safeFilename,
        originalFilename: originalFilename,
        name: originalFilename,
        displayName: originalFilename,
        url: urlData.publicUrl,
        publicUrl: urlData.publicUrl,
        downloadUrl: urlData.publicUrl,
        previewUrl: urlData.publicUrl,
        contentType: att.contentType || 'application/octet-stream',
        type: att.contentType || 'application/octet-stream',
        mimeType: att.contentType || 'application/octet-stream',
        size: contentBuffer.length,
        extension: originalFilename.split('.').pop() || 'bin',
        path: data.path,
        isImage: (att.contentType || '').startsWith('image/'),
        isPdf: (att.contentType || '') === 'application/pdf',
        isText: (att.contentType || '').startsWith('text/'),
        isAudio: (att.contentType || '').startsWith('audio/'),
        isVideo: (att.contentType || '').startsWith('video/'),
        base64: false
      };

      return attachmentResult;

    } catch (attErr) {
      console.error(`   ❌ Attachment processing error:`, attErr.message);
      return null;
    }
  });

  const results = await Promise.allSettled(attachmentPromises);
  
  const successfulAttachments = results
    .filter(result => result.status === 'fulfilled' && result.value !== null)
    .map(result => result.value);

  console.log(`📎 Completed: ${successfulAttachments.length}/${attachments.length} successful`);
  
  return successfulAttachments;
}

// FIXED: Enhanced email data structure
function createEmailData(parsed, messageId, attachmentLinks, options = {}) {
  const attachments = attachmentLinks.map(att => ({
    id: att.id,
    filename: att.filename,
    originalFilename: att.originalFilename,
    name: att.name,
    displayName: att.displayName,
    url: att.url,
    publicUrl: att.publicUrl,
    downloadUrl: att.downloadUrl,
    previewUrl: att.previewUrl,
    contentType: att.contentType,
    type: att.type,
    mimeType: att.mimeType,
    size: att.size,
    extension: att.extension,
    path: att.path,
    isImage: att.isImage,
    isPdf: att.isPdf,
    isText: att.isText,
    isAudio: att.isAudio,
    isVideo: att.isVideo,
    base64: att.base64 || false
  }));

  const emailData = {
    messageId: messageId,
    subject: parsed.subject || '(No Subject)',
    from: parsed.from?.text || "",
    to: parsed.to?.text || "",
    date: parsed.date || new Date(),
    text: parsed.text || "",
    html: parsed.html || "",
    fromName: parsed.from?.value?.[0]?.name || "",
    fromAddress: parsed.from?.value?.[0]?.address || "",
    attachments: attachments,
    hasAttachments: attachments.length > 0,
    attachmentsCount: attachments.length,
    processedAt: new Date(),
    id: messageId,
    ...options
  };

  return emailData;
}

// ========== ENHANCED API ENDPOINTS ==========

// ✅ ENHANCED: Advanced search with pagination and better performance
app.post("/api/search-emails-advanced", authenticateUser, async (req, res) => {
  try {
    const { 
      search: searchTerm, 
      limit = 1000, 
      page = 1,
      fields = ['subject', 'from_text', 'text_content', 'to_text'],
      dateFrom,
      dateTo,
      hasAttachments
    } = req.body;
    
    const userId = req.user.id;
    const userEmail = req.user.email;

    console.log(`🔍 ADVANCED SEARCH for user ${userEmail}: "${searchTerm}", page: ${page}, limit: ${limit}`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase is not available"
      });
    }

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Search term is required"
      });
    }

    const trimmedSearchTerm = searchTerm.trim();
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build the query dynamically
    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    // Add search conditions for specified fields
    const searchConditions = fields.map(field => `${field}.ilike.%${trimmedSearchTerm}%`);
    if (searchConditions.length > 0) {
      query = query.or(searchConditions.join(','));
    }

    // Add date range filter if provided
    if (dateFrom) {
      query = query.gte('date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('date', dateTo);
    }

    // Add attachment filter if provided
    if (hasAttachments !== undefined) {
      query = query.eq('has_attachments', hasAttachments);
    }

    // Add pagination and sorting
    query = query
      .order('date', { ascending: false })
      .range(offset, offset + limitNum - 1);

    const { data: emails, error, count } = await query;

    if (error) {
      console.error("❌ Supabase advanced search error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to search emails",
        details: error.message
      });
    }

    console.log(`🔍 Advanced search query executed for ${userEmail}: Found ${emails?.length || 0} emails out of ${count} total`);

    // Enhanced email data for frontend
    const enhancedEmails = (emails || []).map(email => ({
      id: email.message_id,
      _id: email.message_id,
      messageId: email.message_id,
      subject: email.subject,
      from: email.from_text,
      from_text: email.from_text,
      to: email.to_text,
      to_text: email.to_text,
      date: email.date,
      text: email.text_content,
      text_content: email.text_content,
      html: email.html_content,
      html_content: email.html_content,
      attachments: email.attachments || [],
      hasAttachments: email.has_attachments,
      attachmentsCount: email.attachments_count,
      read: email.read || false,
      user_id: email.user_id,
      user_email: email.user_email
    }));

    const totalPages = Math.ceil((count || 0) / limitNum);
    const hasMore = pageNum < totalPages;

    console.log(`✅ Advanced search completed for ${userEmail}: Page ${pageNum}/${totalPages}, showing ${enhancedEmails.length} emails`);

    res.json({
      success: true,
      message: `Found ${count} emails matching "${trimmedSearchTerm}"`,
      data: {
        emails: enhancedEmails,
        total: count,
        searchTerm: trimmedSearchTerm,
        userEmail: userEmail,
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          hasMore: hasMore,
          limit: limitNum,
          totalResults: count
        },
        source: 'advanced_search'
      }
    });

  } catch (error) {
    console.error("❌ Advanced search emails error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NEW: Get email statistics for a user
app.get("/api/email-stats", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    console.log(`📊 Getting email statistics for ${userEmail}`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase is not available"
      });
    }

    // Get total count
    const { count: totalCount, error: countError } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      throw countError;
    }

    // Get count with attachments
    const { count: withAttachmentsCount, error: attachError } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('has_attachments', true);

    // Get date range
    const { data: dateRange, error: dateError } = await supabase
      .from('emails')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .limit(1);

    const { data: latestEmail, error: latestError } = await supabase
      .from('emails')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1);

    res.json({
      success: true,
      data: {
        totalEmails: totalCount || 0,
        emailsWithAttachments: withAttachmentsCount || 0,
        dateRange: {
          oldest: dateRange?.[0]?.date || null,
          latest: latestEmail?.[0]?.date || null
        },
        userEmail: userEmail
      }
    });

  } catch (error) {
    console.error("❌ Email stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NEW: Bulk export emails endpoint (for large datasets)
app.post("/api/export-emails", authenticateUser, async (req, res) => {
  try {
    const { search: searchTerm, format = 'json', limit = 10000 } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    console.log(`📤 Exporting emails for ${userEmail}, format: ${format}, search: "${searchTerm}"`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase is not available"
      });
    }

    let query = supabase
      .from('emails')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(Math.min(10000, limit));

    if (searchTerm && searchTerm.trim().length > 0) {
      const trimmedSearch = searchTerm.trim();
      query = query.or(`subject.ilike.%${trimmedSearch}%,from_text.ilike.%${trimmedSearch}%,text_content.ilike.%${trimmedSearch}%`);
    }

    const { data: emails, error } = await query;

    if (error) {
      throw error;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      userEmail: userEmail,
      totalEmails: emails.length,
      searchTerm: searchTerm || 'all',
      emails: emails.map(email => ({
        id: email.message_id,
        subject: email.subject,
        from: email.from_text,
        to: email.to_text,
        date: email.date,
        hasAttachments: email.has_attachments,
        attachmentsCount: email.attachments_count,
        textContent: email.text_content ? email.text_content.substring(0, 500) + '...' : '', // Truncate for export
        htmlContent: email.html_content ? '...' : '' // Don't export full HTML
      }))
    };

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['ID', 'Subject', 'From', 'To', 'Date', 'Attachments', 'Text Preview'];
      const csvRows = [headers.join(',')];
      
      exportData.emails.forEach(email => {
        const row = [
          `"${email.id}"`,
          `"${(email.subject || '').replace(/"/g, '""')}"`,
          `"${(email.from || '').replace(/"/g, '""')}"`,
          `"${(email.to || '').replace(/"/g, '""')}"`,
          `"${email.date}"`,
          `"${email.attachmentsCount}"`,
          `"${(email.textContent || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=emails-export-${Date.now()}.csv`);
      return res.send(csvContent);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=emails-export-${Date.now()}.json`);
      return res.json(exportData);
    }

  } catch (error) {
    console.error("❌ Export emails error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Enhanced search to search ALL emails in database for the user
app.post("/api/search-emails", authenticateUser, async (req, res) => {
  try {
    const { search: searchTerm, limit = 1000 } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    console.log(`🔍 Searching ALL emails in database for user ${userEmail}: "${searchTerm}"`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase is not available"
      });
    }

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Search term is required"
      });
    }

    const trimmedSearchTerm = searchTerm.trim();
    
    // Search in ALL emails in Supabase for this user with better query
    const { data: emails, error, count } = await supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .or(`subject.ilike.%${trimmedSearchTerm}%,from_text.ilike.%${trimmedSearchTerm}%,text_content.ilike.%${trimmedSearchTerm}%,to_text.ilike.%${trimmedSearchTerm}%`)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) {
      console.error("❌ Supabase search error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to search emails",
        details: error.message
      });
    }

    console.log(`🔍 Search query executed for ${userEmail}: Found ${emails?.length || 0} emails`);

    // Enhanced email data for frontend
    const enhancedEmails = (emails || []).map(email => ({
      id: email.message_id,
      _id: email.message_id,
      messageId: email.message_id,
      subject: email.subject,
      from: email.from_text,
      from_text: email.from_text,
      to: email.to_text,
      to_text: email.to_text,
      date: email.date,
      text: email.text_content,
      text_content: email.text_content,
      html: email.html_content,
      html_content: email.html_content,
      attachments: email.attachments || [],
      hasAttachments: email.has_attachments,
      attachmentsCount: email.attachments_count,
      read: email.read || false,
      user_id: email.user_id,
      user_email: email.user_email
    }));

    console.log(`✅ Search completed for ${userEmail}: Found ${enhancedEmails.length} emails for "${trimmedSearchTerm}" out of ${count} total emails`);

    res.json({
      success: true,
      message: `Found ${enhancedEmails.length} emails matching "${trimmedSearchTerm}"`,
      data: {
        emails: enhancedEmails,
        total: count,
        searchTerm: trimmedSearchTerm,
        userEmail: userEmail,
        source: 'database_search'
      }
    });

  } catch (error) {
    console.error("❌ Search emails error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Enhanced fetch-emails to handle oldest mode properly
app.post("/api/fetch-emails", authenticateUser, async (req, res) => {
  console.log(`🔍 DEBUG: /api/fetch-emails called for user: ${req.user.email}`);
  try {
    const { mode = "latest", count = 20, loadOlder = false } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    // Get user-specific IMAP connection
    const userImap = await imapManager.getUserConnection(userId, userEmail);
    
    if (!userImap.connection || userImap.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log(`🔄 Fetching emails for ${userEmail} in ${mode} mode, count: ${count}, loadOlder: ${loadOlder}`);
    
    userImap.openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 ${userEmail} - Total Messages: ${box.messages.total}`);
      
      // Calculate fetch range based on mode
      const totalMessages = box.messages.total;
      const fetchCount = Math.min(count, totalMessages);
      
      let fetchStart, fetchEnd;
      
      if (mode === "oldest" || loadOlder) {
        // For oldest mode, fetch from the beginning
        fetchStart = 1;
        fetchEnd = Math.min(fetchCount, totalMessages);
        console.log(`📨 ${userEmail} - Fetching OLDEST emails: ${fetchStart}:${fetchEnd}`);
      } else {
        // For latest mode (default), fetch from the end
        fetchStart = Math.max(1, totalMessages - fetchCount + 1);
        fetchEnd = totalMessages;
        console.log(`📨 ${userEmail} - Fetching LATEST emails: ${fetchStart}:${fetchEnd}`);
      }
      
      const fetchRange = `${fetchStart}:${fetchEnd}`;

      const f = userImap.connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let duplicateCount = 0;
      let newEmails = [];
      let processingDetails = [];

      f.on("message", function (msg, seqno) {
        console.log(`📨 ${userEmail} - Processing message #${seqno}`);
        let buffer = "";

        msg.on("body", function (stream) {
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });
        });

        msg.once("end", async function () {
          try {
            const parsed = await simpleParser(buffer);

            // Generate messageId if missing
            const messageId = parsed.messageId || `email-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            // Check for duplicates for this user
            if (mode !== "force") {
              const isDuplicate = await checkDuplicate(userId, messageId);
              if (isDuplicate) {
                console.log(`   ⚠️ Duplicate skipped: ${parsed.subject}`);
                duplicateCount++;
                processingDetails.push({
                  messageId: messageId.substring(0, 50) + '...',
                  subject: parsed.subject || '(No Subject)',
                  status: 'duplicate'
                });
                return;
              }
            }

            // Process attachments
            console.log(`   📎 Processing attachments for: ${parsed.subject}`);
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            // Create email data with user info
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              fetchMode: mode,
              sequenceNumber: seqno,
              userId: userId,
              userEmail: userEmail
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ New email: ${parsed.subject} (${attachmentLinks.length} attachments)`);
            
            processingDetails.push({
              messageId: messageId.substring(0, 50) + '...',
              subject: parsed.subject || '(No Subject)',
              status: 'new',
              attachments: attachmentLinks.length
            });

          } catch (parseErr) {
            console.error("   ❌ Parse error:", parseErr.message);
          }
        });
      });

      f.once("error", function (err) {
        console.error(`❌ Fetch error for ${userEmail}:`, err);
        res.status(500).json({ 
          success: false,
          error: "Fetch error: " + err.message 
        });
      });

      f.once("end", async function () {
        console.log(`🔄 Processing ${newEmails.length} new emails for ${userEmail}...`);
        
        try {
          // Save to Supabase with user_id
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} emails to Supabase for ${userEmail}...`);
            
            const saveOps = newEmails.map(async (email) => {
              try {
                if (supabaseEnabled && supabase) {
                  const supabaseData = {
                    message_id: email.messageId,
                    subject: email.subject,
                    from_text: email.from,
                    to_text: email.to,
                    date: email.date,
                    text_content: email.text,
                    html_content: email.html,
                    attachments: email.attachments,
                    has_attachments: email.hasAttachments,
                    attachments_count: email.attachmentsCount,
                    user_id: userId,
                    user_email: userEmail,
                    created_at: new Date(),
                    updated_at: new Date()
                  };

                  const { error: supabaseError } = await supabase.from('emails').upsert(supabaseData);
                  if (supabaseError) {
                    console.error("   ❌ Supabase save error:", supabaseError);
                  } else {
                    console.log(`   ✅ Saved to Supabase for ${userEmail}: ${email.subject}`);
                  }
                }
                
                return true;
              } catch (saveErr) {
                console.error(`   ❌ Error saving email:`, saveErr);
                return false;
              }
            });

            await Promise.allSettled(saveOps);
            clearCache();
            console.log(`🗑️ Cleared cache for ${userEmail}`);
          }

          console.log(`✅ Fetch completed for ${userEmail}: ${processedCount} new, ${duplicateCount} duplicates`);
          
          res.json({
            success: true,
            message: `Processed ${processedCount} new emails for ${userEmail}`,
            data: {
              processed: processedCount,
              duplicates: duplicateCount,
              total: processedCount + duplicateCount,
              userEmail: userEmail,
              emails: newEmails,
              details: processingDetails,
              fetchMode: mode,
              loadOlder: loadOlder
            }
          });

        } catch (batchError) {
          console.error("❌ Batch processing error:", batchError);
          res.status(500).json({ 
            success: false,
            error: "Batch processing failed: " + batchError.message 
          });
        }
      });
    });

  } catch (error) {
    console.error("❌ Fetch emails API error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ FIXED: Enhanced load-older-emails endpoint
app.post("/api/load-older-emails", authenticateUser, async (req, res) => {
  try {
    const { lastSequence = null, count = 50 } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    console.log(`📨 Loading OLDER emails for ${userEmail}, last sequence: ${lastSequence}, count: ${count}`);

    const userImap = await imapManager.getUserConnection(userId, userEmail);
    
    if (!userImap.connection || userImap.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    userImap.openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }

      const totalMessages = box.messages.total;
      
      // Calculate the range for older emails
      let fetchStart, fetchEnd;
      
      if (lastSequence) {
        // Load emails before the given sequence number
        fetchStart = Math.max(1, lastSequence - count);
        fetchEnd = lastSequence - 1;
      } else {
        // Initial load of oldest emails
        fetchStart = 1;
        fetchEnd = Math.min(count, totalMessages);
      }

      if (fetchStart < 1 || fetchEnd < fetchStart) {
        return res.json({
          success: true,
          message: "No more older emails to load",
          data: {
            processed: 0,
            duplicates: 0,
            emails: [],
            hasMore: false,
            nextLastSequence: null
          }
        });
      }

      const fetchRange = `${fetchStart}:${fetchEnd}`;
      console.log(`📨 ${userEmail} - Fetching OLDER emails range: ${fetchRange}`);

      const f = userImap.connection.seq.fetch(fetchRange, { 
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
            const messageId = parsed.messageId || `email-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            // Check for duplicates
            const isDuplicate = await checkDuplicate(userId, messageId);
            if (isDuplicate) {
              duplicateCount++;
              return;
            }

            // Process attachments
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              userId: userId,
              userEmail: userEmail,
              sequenceNumber: seqno
            });

            newEmails.push(emailData);
            processedCount++;

          } catch (parseErr) {
            console.error(`   ❌ Parse error for message ${seqno}:`, parseErr.message);
          }
        });
      });

      f.once("error", function (err) {
        console.error(`❌ Load older emails error for ${userEmail}:`, err);
        res.status(500).json({ 
          success: false,
          error: "Load older emails error: " + err.message 
        });
      });

      f.once("end", async function () {
        try {
          // Save to Supabase
          if (newEmails.length > 0) {
            const saveOps = newEmails.map(async (email) => {
              try {
                if (supabaseEnabled && supabase) {
                  const supabaseData = {
                    message_id: email.messageId,
                    subject: email.subject,
                    from_text: email.from,
                    to_text: email.to,
                    date: email.date,
                    text_content: email.text,
                    html_content: email.html,
                    attachments: email.attachments,
                    has_attachments: email.hasAttachments,
                    attachments_count: email.attachmentsCount,
                    user_id: userId,
                    user_email: userEmail,
                    created_at: new Date(),
                    updated_at: new Date()
                  };

                  await supabase.from('emails').upsert(supabaseData);
                }
                return true;
              } catch (saveErr) {
                console.error(`   ❌ Error saving email:`, saveErr);
                return false;
              }
            });

            await Promise.allSettled(saveOps);
            clearCache();
          }

          const hasMore = fetchStart > 1;
          const nextLastSequence = hasMore ? fetchStart : null;

          res.json({
            success: true,
            message: `Loaded ${processedCount} older emails for ${userEmail}`,
            data: {
              processed: processedCount,
              duplicates: duplicateCount,
              emails: newEmails,
              hasMore: hasMore,
              nextLastSequence: nextLastSequence,
              userEmail: userEmail
            }
          });

        } catch (batchError) {
          console.error("❌ Batch processing error:", batchError);
          res.status(500).json({ 
            success: false,
            error: "Batch processing failed: " + batchError.message 
          });
        }
      });
    });

  } catch (error) {
    console.error("❌ Load older emails error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ FIXED: Get emails with proper pagination for old emails
app.get("/api/emails", authenticateUser, async (req, res) => {
  try {
    const { search = "", sort = "date_desc", page = 1, limit = 50, loadOlder = false } = req.query;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    console.log(`📧 Fetching emails for ${userEmail}: page=${pageNum}, limit=${limitNum}, search="${search}", sort=${sort}, loadOlder=${loadOlder}`);

    // Create user-specific cache key
    const cacheKey = `emails:${userId}:${search}:${sort}:${pageNum}:${limitNum}:${loadOlder}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      console.log(`📦 Serving from cache for ${userEmail}`);
      return res.json(cached);
    }

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ 
        error: "Supabase is not available" 
      });
    }

    let query = supabase.from('emails').select('*', { count: 'exact' })
      .eq('user_id', userId); // Only get this user's emails
    
    // Add search if provided
    if (search && search.trim().length > 0) {
      const trimmedSearch = search.trim();
      query = query.or(`subject.ilike.%${trimmedSearch}%,from_text.ilike.%${trimmedSearch}%,text_content.ilike.%${trimmedSearch}%`);
    }
    
    // Add sorting - for oldest first, use date ascending
    if (loadOlder === 'true' || sort === "date_asc") {
      query = query.order('date', { ascending: true });
    } else {
      query = query.order('date', { ascending: false });
    }
    
    // Add pagination
    query = query.range(skip, skip + limitNum - 1);
    
    const { data: emails, error, count } = await query;
    
    if (error) {
      console.error("❌ Supabase query error:", error);
      return res.status(500).json({ 
        error: "Failed to fetch emails from Supabase",
        details: error.message 
      });
    }

    console.log(`📧 Supabase returned ${emails?.length || 0} emails for ${userEmail}`);

    // Enhanced email data for frontend
    const enhancedEmails = (emails || []).map(email => ({
      id: email.message_id,
      _id: email.message_id,
      messageId: email.message_id,
      subject: email.subject,
      from: email.from_text,
      from_text: email.from_text,
      to: email.to_text,
      to_text: email.to_text,
      date: email.date,
      text: email.text_content,
      text_content: email.text_content,
      html: email.html_content,
      html_content: email.html_content,
      attachments: email.attachments || [],
      hasAttachments: email.has_attachments,
      attachmentsCount: email.attachments_count,
      read: email.read || false,
      user_id: email.user_id,
      user_email: email.user_email
    }));

    const hasMore = skip + (emails?.length || 0) < (count || 0);

    const response = {
      emails: enhancedEmails,
      total: count || 0,
      hasMore,
      page: pageNum,
      limit: limitNum,
      userEmail: userEmail,
      source: 'supabase',
      loadOlder: loadOlder === 'true'
    };

    setToCache(cacheKey, response);

    console.log(`✅ Sending ${enhancedEmails.length} emails from Supabase for ${userEmail} (page ${pageNum}, loadOlder: ${loadOlder})`);
    res.json(response);

  } catch (error) {
    console.error("❌ Emails fetch error:", error);
    res.status(500).json({ 
      error: "Failed to fetch emails",
      details: error.message 
    });
  }
});

// ✅ NEW: Get oldest emails specifically
app.get("/api/emails/oldest", authenticateUser, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));

    console.log(`📧 Fetching OLDEST emails for ${userEmail}, limit: ${limitNum}`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ 
        error: "Supabase is not available" 
      });
    }

    const { data: emails, error, count } = await supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('date', { ascending: true }) // Oldest first
      .limit(limitNum);
    
    if (error) {
      console.error("❌ Supabase query error:", error);
      return res.status(500).json({ 
        error: "Failed to fetch oldest emails from Supabase",
        details: error.message 
      });
    }

    // Enhanced email data for frontend
    const enhancedEmails = (emails || []).map(email => ({
      id: email.message_id,
      _id: email.message_id,
      messageId: email.message_id,
      subject: email.subject,
      from: email.from_text,
      from_text: email.from_text,
      to: email.to_text,
      to_text: email.to_text,
      date: email.date,
      text: email.text_content,
      text_content: email.text_content,
      html: email.html_content,
      html_content: email.html_content,
      attachments: email.attachments || [],
      hasAttachments: email.has_attachments,
      attachmentsCount: email.attachments_count,
      read: email.read || false,
      user_id: email.user_id,
      user_email: email.user_email
    }));

    console.log(`✅ Sending ${enhancedEmails.length} OLDEST emails from Supabase for ${userEmail}`);

    res.json({
      emails: enhancedEmails,
      total: count || 0,
      userEmail: userEmail,
      source: 'supabase_oldest'
    });

  } catch (error) {
    console.error("❌ Oldest emails fetch error:", error);
    res.status(500).json({ 
      error: "Failed to fetch oldest emails",
      details: error.message 
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    supabase: supabaseEnabled ? "connected" : "disconnected",
    emailConfigs: {
      count: Object.keys(emailConfigs).length,
      configured: Object.keys(emailConfigs).length > 0
    },
    cache: {
      size: cache.size,
      ttl: CACHE_TTL
    }
  });
});

// Clear cache endpoint
app.post("/api/clear-cache", authenticateUser, (req, res) => {
  const previousSize = cache.size;
  clearCache();
  res.json({
    success: true,
    message: `Cache cleared (${previousSize} items removed)`,
    user: req.user.email
  });
});

// Delete email endpoint
app.delete("/api/emails/:messageId", authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const userEmail = req.user.email;

    console.log(`🗑️ Deleting email for ${userEmail}: ${messageId}`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase is not available"
      });
    }

    // First get the email to check attachments
    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', userId)
      .eq('message_id', messageId)
      .single();

    if (fetchError) {
      return res.status(404).json({
        success: false,
        error: "Email not found"
      });
    }

    // Delete attachments from storage if they exist
    if (email.attachments && Array.isArray(email.attachments) && email.attachments.length > 0) {
      console.log(`🗑️ Deleting ${email.attachments.length} attachments for email ${messageId}`);
      
      const deletePromises = email.attachments.map(async (attachment) => {
        if (attachment.path) {
          const { error: storageError } = await supabase.storage
            .from('attachments')
            .remove([attachment.path]);
          
          if (storageError) {
            console.error(`❌ Failed to delete attachment ${attachment.path}:`, storageError);
          } else {
            console.log(`✅ Deleted attachment: ${attachment.path}`);
          }
        }
      });

      await Promise.allSettled(deletePromises);
    }

    // Delete the email record
    const { error: deleteError } = await supabase
      .from('emails')
      .delete()
      .eq('user_id', userId)
      .eq('message_id', messageId);

    if (deleteError) {
      throw deleteError;
    }

    clearCache(); // Clear cache after deletion

    console.log(`✅ Successfully deleted email ${messageId} for ${userEmail}`);
    
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

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Email IMAP Backend Server - Enhanced Multi-User Support",
    version: "5.0.0",
    environment: process.env.NODE_ENV || 'development',
    supabase: supabaseEnabled ? "enabled" : "disabled",
    emailConfigs: {
      count: Object.keys(emailConfigs).length,
      emails: Object.keys(emailConfigs)
    },
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/email-stats": "Get email statistics (authenticated)",
      "GET /api/emails": "Get emails with pagination (authenticated)",
      "GET /api/emails/oldest": "Get oldest emails specifically (authenticated)",
      "POST /api/fetch-emails": "Fetch new emails with mode support (authenticated)",
      "POST /api/load-older-emails": "Load older emails with pagination (authenticated)",
      "POST /api/search-emails": "Search ALL emails in database (authenticated)",
      "POST /api/search-emails-advanced": "Advanced search with pagination (authenticated)",
      "POST /api/export-emails": "Export emails to JSON/CSV (authenticated)",
      "DELETE /api/emails/:messageId": "Delete email and attachments (authenticated)",
      "POST /api/clear-cache": "Clear cache (authenticated)"
    }
  });
});

// Serve static files from the React app build directory
const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

// Handle client-side routing
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Initialize application
async function initializeApp() {
  console.log("🚀 Initializing application...");
  
  if (supabaseEnabled) {
    await ensureStorageBucket();
  }
  
  console.log("✅ Application initialized");
  console.log(`📋 Supabase: ${supabaseEnabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`📧 Email Configurations: ${Object.keys(emailConfigs).length} loaded`);
}

// Call initialization
initializeApp();

// Start server for local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📧 Email IMAP Backend Server - Enhanced Multi-User Support`);
    console.log(`📋 Supabase: ${supabaseEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📧 Email Configurations: ${Object.keys(emailConfigs).length} loaded`);
  });
}

// Vercel serverless function handler
const handler = async (req, res) => {
  try {
    // Initialize Supabase on each request to ensure it's ready
    if (!supabaseEnabled) {
      initializeSupabase();
    }

    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export default handler;