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

// Simple IMAP connection function
async function createIMAPConnection(userEmail, password) {
  return new Promise((resolve, reject) => {
    const connection = new Imap({
      user: userEmail,
      password: password,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 30000,
      authTimeout: 15000
    });

    connection.once('ready', () => {
      console.log(`✅ IMAP connected for: ${userEmail}`);
      resolve(connection);
    });

    connection.once('error', (err) => {
      console.error(`❌ IMAP connection error for ${userEmail}:`, err.message);
      reject(err);
    });

    connection.connect();
  });
}

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

// ✅ IMPROVED: Enhanced duplicate checking
async function checkDuplicate(userId, messageId) {
  try {
    if (!supabaseEnabled || !supabase) {
      console.log("⚠️ Supabase not available for duplicate check");
      return false;
    }

    // Normalize messageId
    const normalizedMessageId = messageId.trim();
    
    const { data, error } = await supabase
      .from('emails')
      .select('message_id, user_id')
      .eq('user_id', userId)
      .eq('message_id', normalizedMessageId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("❌ Duplicate check error:", error);
      return false;
    }

    return !!data; // Returns true if duplicate exists

  } catch (error) {
    console.error("❌ Duplicate check exception:", error);
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

// ========== API ENDPOINTS ==========

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

// ✅ FIXED: Get ALL emails without pagination (for initial load)
app.get("/api/all-emails", authenticateUser, async (req, res) => {
  try {
    const { limit = 10000 } = req.query;
    const userId = req.user.id;
    const userEmail = req.user.email;

    console.log(`📧 Fetching ALL emails (no pagination) for ${userEmail}, limit: ${limit}`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        error: "Supabase is not available"
      });
    }

    // Get ALL emails for this user, newest first
    const { data: emails, error, count } = await supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(Math.min(10000, parseInt(limit)));

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
      starred: email.starred || false,
      user_id: email.user_id,
      user_email: email.user_email,
      created_at: email.created_at,
      updated_at: email.updated_at
    }));

    const response = {
      emails: enhancedEmails,
      total: count || 0,
      userEmail: userEmail,
      source: 'supabase_all',
      message: `Loaded ALL ${enhancedEmails.length} emails from database`
    };

    console.log(`✅ Sending ALL ${enhancedEmails.length} emails from Supabase for ${userEmail}`);
    res.json(response);

  } catch (error) {
    console.error("❌ All emails fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch all emails",
      details: error.message
    });
  }
});

// ✅ FIXED: Get emails with pagination
app.get("/api/emails", authenticateUser, async (req, res) => {
  try {
    const { search = "", sort = "date_desc", page = 1, limit = 1000 } = req.query;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(10000, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    console.log(`📧 Fetching emails from Supabase for ${userEmail}: page=${pageNum}, limit=${limitNum}, search="${search}", sort=${sort}`);

    // Create user-specific cache key
    const cacheKey = `emails:${userId}:${search}:${sort}:${pageNum}:${limitNum}`;
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

    // Build query
    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);
    
    // Add search if provided
    if (search && search.trim().length > 0) {
      const trimmedSearch = search.trim();
      query = query.or(`subject.ilike.%${trimmedSearch}%,from_text.ilike.%${trimmedSearch}%,text_content.ilike.%${trimmedSearch}%,to_text.ilike.%${trimmedSearch}%`);
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
    query = query.range(offset, offset + limitNum - 1);
    
    const { data: emails, error, count } = await query;
    
    if (error) {
      console.error("❌ Supabase query error:", error);
      return res.status(500).json({ 
        error: "Failed to fetch emails from Supabase",
        details: error.message 
      });
    }

    console.log(`📧 Supabase returned ${emails?.length || 0} emails for ${userEmail} out of ${count} total`);

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
      starred: email.starred || false,
      user_id: email.user_id,
      user_email: email.user_email,
      created_at: email.created_at,
      updated_at: email.updated_at
    }));

    const totalPages = Math.ceil((count || 0) / limitNum);
    const hasMore = pageNum < totalPages;

    const response = {
      emails: enhancedEmails,
      total: count || 0,
      hasMore,
      page: pageNum,
      limit: limitNum,
      totalPages,
      userEmail: userEmail,
      source: 'supabase',
      message: `Loaded ${enhancedEmails.length} emails (${count} total in database)`
    };

    setToCache(cacheKey, response);

    console.log(`✅ Sending ${enhancedEmails.length} emails from Supabase for ${userEmail} (page ${pageNum}/${totalPages})`);
    res.json(response);

  } catch (error) {
    console.error("❌ Emails fetch error:", error);
    res.status(500).json({ 
      error: "Failed to fetch emails",
      details: error.message 
    });
  }
});

// ✅ FIXED: Search emails endpoint
app.post("/api/search-emails", authenticateUser, async (req, res) => {
  try {
    const { search: searchTerm, limit = 5000, page = 1 } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    console.log(`🔍 Searching emails in Supabase for user ${userEmail}: "${searchTerm}", page: ${page}, limit: ${limit}`);

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
    
    // Search in emails for this user
    const { data: emails, error, count } = await supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .or(`subject.ilike.%${trimmedSearchTerm}%,from_text.ilike.%${trimmedSearchTerm}%,text_content.ilike.%${trimmedSearchTerm}%,to_text.ilike.%${trimmedSearchTerm}%`)
      .order('date', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      console.error("❌ Supabase search error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to search emails",
        details: error.message
      });
    }

    console.log(`🔍 Search query executed for ${userEmail}: Found ${emails?.length || 0} emails out of ${count} total`);

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
      starred: email.starred || false,
      user_id: email.user_id,
      user_email: email.user_email
    }));

    const totalPages = Math.ceil((count || 0) / limitNum);
    const hasMore = pageNum < totalPages;

    console.log(`✅ Search completed for ${userEmail}: Found ${enhancedEmails.length} emails for "${trimmedSearchTerm}" out of ${count} total emails`);

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
          limit: limitNum
        },
        source: 'supabase_search'
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

// ✅ FIXED: Enhanced fetch emails with proper force fetch handling
app.post("/api/fetch-emails", authenticateUser, async (req, res) => {
  console.log(`🔍 DEBUG: /api/fetch-emails called for user: ${req.user.email}`);
  
  try {
    const { count = 100, force = false } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;
    const password = emailConfigs[userEmail];

    if (!password) {
      return res.status(400).json({ error: "Email configuration not found" });
    }

    console.log(`🔄 ${force ? 'FORCE ' : ''}Fetching ${count} LATEST emails for ${userEmail}`);

    // Clear cache for force mode
    if (force) {
      clearCache();
      console.log(`🗑️ Cache cleared for force mode`);
    }

    // Create IMAP connection
    const connection = await createIMAPConnection(userEmail, password);
    
    connection.openBox("INBOX", true, async (err, box) => {
      if (err) {
        connection.end();
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 ${userEmail} - Total Messages in INBOX: ${box.messages.total}`);
      
      const totalMessages = box.messages.total;
      
      if (totalMessages === 0) {
        connection.end();
        return res.json({
          success: true,
          message: "No emails in inbox",
          data: {
            processed: 0,
            duplicates: 0,
            total: 0,
            userEmail: userEmail
          }
        });
      }

      // Calculate range - get latest emails first
      const fetchCount = Math.min(count, totalMessages);
      const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
      const fetchEnd = totalMessages;
      
      const fetchRange = `${fetchStart}:${fetchEnd}`;
      console.log(`📨 ${userEmail} - ${force ? 'FORCE ' : ''}Fetching LATEST emails range: ${fetchRange} (${fetchCount} emails)`);

      const f = connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      let newEmails = [];

      f.on("message", function (msg, seqno) {
        console.log(`📨 ${userEmail} - Processing message #${seqno}${force ? ' (FORCE MODE)' : ''}`);
        let buffer = "";

        msg.on("body", function (stream) {
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });
        });

        msg.once("end", async function () {
          try {
            const parsed = await simpleParser(buffer);

            // Generate robust messageId
            const messageId = parsed.messageId || 
                             parsed.headers['message-id'] || 
                             `email-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 15)}`;

            console.log(`   ${force ? '⚡' : '📧'} Processing: "${parsed.subject}"`);

            // Skip duplicate check in force mode
            if (!force) {
              const isDuplicate = await checkDuplicate(userId, messageId);
              if (isDuplicate) {
                console.log(`   ⚠️ Duplicate skipped: ${parsed.subject}`);
                duplicateCount++;
                return;
              }
            } else {
              console.log(`   ⚡ FORCE MODE: Bypassing duplicate check`);
            }

            // Process attachments
            console.log(`   📎 Processing attachments for: ${parsed.subject}`);
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            // Create email data with user info
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              userId: userId,
              userEmail: userEmail,
              sequenceNo: seqno
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ ${force ? 'Force ' : ''}Processed: ${parsed.subject} (${attachmentLinks.length} attachments)`);

          } catch (parseErr) {
            console.error(`   ❌ Parse error for message ${seqno}:`, parseErr.message);
            errorCount++;
          }
        });
      });

      f.once("error", function (err) {
        console.error(`❌ Fetch error for ${userEmail}:`, err);
        connection.end();
        res.status(500).json({ 
          success: false,
          error: "Fetch error: " + err.message 
        });
      });

      f.once("end", async function () {
        console.log(`🔄 IMAP fetch completed. Processing ${newEmails.length} emails for ${userEmail}...`);
        
        setTimeout(async () => {
          try {
            // Save to Supabase with user_id
            if (newEmails.length > 0) {
              console.log(`💾 Saving ${newEmails.length} emails to Supabase for ${userEmail}...`);
              
              const saveResults = await Promise.allSettled(
                newEmails.map(async (email, index) => {
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

                      // Use upsert to handle duplicates
                      const { error: supabaseError } = await supabase
                        .from('emails')
                        .upsert(supabaseData, { 
                          onConflict: 'message_id,user_id'
                        });

                      if (supabaseError) {
                        console.error(`   ❌ Save error for ${email.subject}:`, supabaseError.message);
                        return { success: false, error: supabaseError.message };
                      } else {
                        console.log(`   ✅ [${index + 1}/${newEmails.length}] Saved to Supabase: ${email.subject}`);
                        return { success: true };
                      }
                    }
                    
                    return { success: false, error: "Supabase not available" };
                  } catch (saveErr) {
                    console.error(`   ❌ Error saving email ${email.subject}:`, saveErr.message);
                    return { success: false, error: saveErr.message };
                  }
                })
              );

              const successfulSaves = saveResults.filter(result => 
                result.status === 'fulfilled' && result.value?.success
              ).length;

              console.log(`💾 Save results: ${successfulSaves}/${newEmails.length} successful`);
            }

            connection.end();
            
            console.log(`✅ ${force ? 'FORCE ' : ''}Fetch completed for ${userEmail}: ${processedCount} new, ${duplicateCount} duplicates, ${errorCount} errors`);
            
            // Clear cache to ensure fresh data
            clearCache();
            console.log(`🗑️ Cleared cache`);
            
            res.json({
              success: true,
              message: `${force ? 'Force ' : ''}Fetched ${processedCount} new emails for ${userEmail}`,
              data: {
                processed: processedCount,
                duplicates: duplicateCount,
                errors: errorCount,
                total: processedCount + duplicateCount + errorCount,
                userEmail: userEmail,
                cacheCleared: true,
                forceMode: force
              }
            });

          } catch (batchError) {
            console.error("❌ Batch processing error:", batchError);
            connection.end();
            res.status(500).json({ 
              success: false,
              error: "Batch processing failed: " + batchError.message 
            });
          }
        }, 2000);
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

// ✅ FIXED: Force refresh endpoint - now properly implemented
app.post("/api/force-refresh", authenticateUser, async (req, res) => {
  try {
    const { count = 100 } = req.body;
    const userEmail = req.user.email;
    const password = emailConfigs[userEmail];

    if (!password) {
      return res.status(400).json({ error: "Email configuration not found" });
    }

    console.log(`⚡ FORCE REFRESH called for ${userEmail}, count: ${count}`);

    // Clear cache immediately
    clearCache();
    console.log(`🗑️ Cache cleared for force refresh`);

    // Create IMAP connection
    const connection = await createIMAPConnection(userEmail, password);
    
    connection.openBox("INBOX", true, async (err, box) => {
      if (err) {
        connection.end();
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 ${userEmail} - Total Messages in INBOX: ${box.messages.total}`);
      
      const totalMessages = box.messages.total;
      
      if (totalMessages === 0) {
        connection.end();
        return res.json({
          success: true,
          message: "No emails in inbox",
          data: {
            processed: 0,
            duplicates: 0,
            total: 0,
            userEmail: userEmail
          }
        });
      }

      // Calculate range - get latest emails first
      const fetchCount = Math.min(count, totalMessages);
      const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
      const fetchEnd = totalMessages;
      
      const fetchRange = `${fetchStart}:${fetchEnd}`;
      console.log(`📨 ${userEmail} - FORCE FETCHING LATEST emails range: ${fetchRange} (${fetchCount} emails)`);

      const f = connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      let newEmails = [];

      f.on("message", function (msg, seqno) {
        console.log(`📨 ${userEmail} - Processing message #${seqno} (FORCE MODE)`);
        let buffer = "";

        msg.on("body", function (stream) {
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });
        });

        msg.once("end", async function () {
          try {
            const parsed = await simpleParser(buffer);

            // Generate robust messageId
            const messageId = parsed.messageId || 
                             parsed.headers['message-id'] || 
                             `email-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 15)}`;

            console.log(`   ⚡ FORCE Processing: "${parsed.subject}"`);

            // In force mode, we process everything without duplicate checks
            console.log(`   ⚡ FORCE MODE: Bypassing duplicate check`);

            // Process attachments
            console.log(`   📎 Processing attachments for: ${parsed.subject}`);
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            // Create email data with user info
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              userId: req.user.id,
              userEmail: userEmail,
              sequenceNo: seqno
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ Force Processed: ${parsed.subject} (${attachmentLinks.length} attachments)`);

          } catch (parseErr) {
            console.error(`   ❌ Parse error for message ${seqno}:`, parseErr.message);
            errorCount++;
          }
        });
      });

      f.once("error", function (err) {
        console.error(`❌ Force fetch error for ${userEmail}:`, err);
        connection.end();
        res.status(500).json({ 
          success: false,
          error: "Force fetch error: " + err.message 
        });
      });

      f.once("end", async function () {
        console.log(`🔄 Force IMAP fetch completed. Processing ${newEmails.length} emails for ${userEmail}...`);
        
        setTimeout(async () => {
          try {
            // Save to Supabase with user_id - force upsert all
            if (newEmails.length > 0) {
              console.log(`💾 Force saving ${newEmails.length} emails to Supabase for ${userEmail}...`);
              
              const saveResults = await Promise.allSettled(
                newEmails.map(async (email, index) => {
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
                        user_id: req.user.id,
                        user_email: userEmail,
                        created_at: new Date(),
                        updated_at: new Date()
                      };

                      // Force upsert - will overwrite existing records
                      const { error: supabaseError } = await supabase
                        .from('emails')
                        .upsert(supabaseData, { 
                          onConflict: 'message_id,user_id'
                        });

                      if (supabaseError) {
                        console.error(`   ❌ Force save error for ${email.subject}:`, supabaseError.message);
                        return { success: false, error: supabaseError.message };
                      } else {
                        console.log(`   ✅ [${index + 1}/${newEmails.length}] Force saved to Supabase: ${email.subject}`);
                        return { success: true };
                      }
                    }
                    
                    return { success: false, error: "Supabase not available" };
                  } catch (saveErr) {
                    console.error(`   ❌ Error force saving email ${email.subject}:`, saveErr.message);
                    return { success: false, error: saveErr.message };
                  }
                })
              );

              const successfulSaves = saveResults.filter(result => 
                result.status === 'fulfilled' && result.value?.success
              ).length;

              console.log(`💾 Force save results: ${successfulSaves}/${newEmails.length} successful`);
            }

            connection.end();
            
            console.log(`✅ FORCE REFRESH completed for ${userEmail}: ${processedCount} processed, ${errorCount} errors`);
            
            // Clear cache to ensure fresh data
            clearCache();
            console.log(`🗑️ Cache cleared after force refresh`);
            
            res.json({
              success: true,
              message: `Force refresh completed for ${userEmail}`,
              data: {
                processed: processedCount,
                errors: errorCount,
                total: processedCount + errorCount,
                userEmail: userEmail,
                cacheCleared: true,
                forceMode: true
              }
            });

          } catch (batchError) {
            console.error("❌ Force batch processing error:", batchError);
            connection.end();
            res.status(500).json({ 
              success: false,
              error: "Force batch processing failed: " + batchError.message 
            });
          }
        }, 2000);
      });
    });

  } catch (error) {
    console.error("❌ Force refresh error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Get email statistics endpoint
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

// ✅ FIXED: Debug endpoint
app.get("/api/debug-state", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Get latest email from database
    const { data: latestEmail, error } = await supabase
      .from('emails')
      .select('message_id, subject, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1);

    // Get email count
    const { count: totalEmails, error: countError } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    res.json({
      success: true,
      data: {
        user: { id: userId, email: userEmail },
        database: {
          latestEmail: latestEmail?.[0] || null,
          totalEmails: totalEmails || 0
        },
        cache: {
          size: cache.size,
          keys: Array.from(cache.keys()).filter(k => k.includes(userId))
        },
        config: {
          emailConfigured: !!emailConfigs[userEmail],
          supabaseEnabled
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("❌ Debug state error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Clear cache endpoint
app.post("/api/clear-cache", authenticateUser, (req, res) => {
  const previousSize = cache.size;
  clearCache();
  res.json({
    success: true,
    message: `Cache cleared (${previousSize} items removed)`,
    user: req.user.email
  });
});

// ✅ FIXED: Delete email endpoint
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
    message: "Email IMAP Backend Server - Complete Email Access",
    version: "7.2.0",
    environment: process.env.NODE_ENV || 'development',
    supabase: supabaseEnabled ? "enabled" : "disabled",
    emailConfigs: {
      count: Object.keys(emailConfigs).length,
      emails: Object.keys(emailConfigs)
    },
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/debug-state": "Debug current state (authenticated)",
      "GET /api/email-stats": "Get email statistics (authenticated)",
      "GET /api/emails": "Get ALL emails with pagination (authenticated)",
      "GET /api/all-emails": "Get ALL emails without pagination (authenticated)",
      "POST /api/fetch-emails": "Fetch new emails from IMAP (authenticated)",
      "POST /api/force-refresh": "Force refresh bypassing duplicates (authenticated)",
      "POST /api/search-emails": "Search ALL emails in Supabase (authenticated)",
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
    console.log(`📧 Email IMAP Backend Server - Complete Email Access`);
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