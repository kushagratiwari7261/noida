import { MongoClient } from "mongodb";
import { createClient } from "@supabase/supabase-js";
import Imap from "imap";
import { simpleParser } from "mailparser";

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

console.log("🔍 DEBUG: Environment check - EMAIL_USER:", !!process.env.EMAIL_USER, "EMAIL_PASS:", !!process.env.EMAIL_PASS, "MONGO_URI:", !!process.env.MONGO_URI, "SUPABASE_URL:", !!process.env.SUPABASE_URL, "SUPABASE_SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_KEY);

// Database connections
let mongoClient = null;
let isMongoConnected = false;
let db = null;

// FIXED: Use SUPABASE_SERVICE_KEY instead of SUPABASE_KEY
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY, // CHANGED: Use service role key
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_KEY
      }
    }
  }
);

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

export async function ensureMongoConnection() {
  if (isMongoConnected && db) return db;

  if (!mongoClient) {
    console.log("⚠️ MongoDB URI not provided, skipping MongoDB connection");
    return null;
  }

  try {
    if (!isMongoConnected) {
      await mongoClient.connect();
      db = mongoClient.db("imapdb");
      isMongoConnected = true;
      console.log("✅ MongoDB connected");

      await setupIndexes();
    }
    return db;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    isMongoConnected = false;
    return null;
  }
}

async function setupIndexes() {
  try {
    if (db) {
      await db.collection("emails").createIndex({ messageId: 1 }, { unique: true });
      await db.collection("emails").createIndex({ date: -1 });
      await db.collection("emails").createIndex({ subject: 1 });
      await db.collection("emails").createIndex({ from: 1 });
      console.log("✅ Database indexes created");
    }
  } catch (err) {
    console.error("❌ Index creation error:", err.message);
  }
}

// Initialize MongoDB client if URI is provided
if (process.env.MONGO_URI) {
  mongoClient = new MongoClient(process.env.MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 5,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
}

// IMAP Connection Manager
class IMAPConnection {
  constructor() {
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
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS,
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
        console.log("✅ IMAP connection ready");
        resolve(this.connection);
      });

      this.connection.once('error', (err) => {
        this.isConnecting = false;
        this.isConnected = false;
        console.error("❌ IMAP connection error:", err.message);

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
          setTimeout(() => {
            this.connect().then(resolve).catch(reject);
          }, this.reconnectDelay);
        } else {
          reject(err);
        }
      });

      this.connection.once('end', () => {
        this.isConnected = false;
        console.log("📤 IMAP connection closed");
      });

      this.connection.on('close', (hadError) => {
        this.isConnected = false;
        console.log(`🔒 IMAP connection closed ${hadError ? 'with error' : 'normally'}`);
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
}

const imapManager = new IMAPConnection();

// Cache functions
export function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

export function setToCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

export function clearCache() {
  cache.clear();
}

// Duplicate check function
export async function checkDuplicate(messageId) {
  try {
    // Check MongoDB
    const mongoDb = await ensureMongoConnection();
    if (mongoDb) {
      const existing = await mongoDb.collection("emails").findOne({ messageId });
      if (existing) return true;
    }

    // Check Supabase
    const { data, error } = await supabase
      .from('emails')
      .select('message_id')
      .eq('message_id', messageId)
      .single();

    return !!data;
  } catch (error) {
    console.error("❌ Duplicate check error:", error);
    return false;
  }
}

// Process attachments function
export async function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) {
    console.log("📎 No attachments found or empty array");
    return [];
  }

  console.log(`📎 Processing ${attachments.length} attachments`);

  const attachmentPromises = attachments.map(async (att, index) => {
    try {
      console.log(`   🔍 Attachment ${index + 1}:`, {
        filename: att.filename,
        contentType: att.contentType,
        size: att.content?.length || 0,
        hasContent: !!att.content
      });

      // Validate attachment content
      if (!att.content) {
        console.log(`   ❌ Attachment ${index + 1} has no content, skipping`);
        return null;
      }

      const originalFilename = att.filename || `unnamed_${Date.now()}_${index}.bin`;
      const safeFilename = originalFilename.replace(/[^a-zA-Z0-9.\-_]/g, '_');

      const supabasePath = `emails/${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${safeFilename}`;

      console.log(`   📤 Uploading to Supabase: ${supabasePath}`);

      // Convert content to Buffer if it's not already
      let contentBuffer;
      if (Buffer.isBuffer(att.content)) {
        contentBuffer = att.content;
      } else if (typeof att.content === 'string') {
        contentBuffer = Buffer.from(att.content, 'utf8');
      } else {
        contentBuffer = Buffer.from(att.content);
      }

      // Enhanced upload with better error handling
      const { data, error } = await supabase.storage
        .from("attachments")
        .upload(supabasePath, contentBuffer, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: false, // Changed to false to avoid conflicts
          cacheControl: '3600'
        });

      if (error) {
        console.error(`   ❌ Supabase upload error for ${safeFilename}:`, {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });

        // Try with a different path if there's a conflict
        const altPath = `emails/alt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${safeFilename}`;
        console.log(`   🔄 Retrying with alternative path: ${altPath}`);

        const { data: retryData, error: retryError } = await supabase.storage
          .from("attachments")
          .upload(altPath, contentBuffer, {
            contentType: att.contentType || 'application/octet-stream',
            upsert: false
          });

        if (retryError) {
          console.error(`   ❌ Retry also failed:`, retryError.message);
          return null;
        }

        // Use retry data if successful
        const { data: publicUrlData } = supabase.storage
          .from("attachments")
          .getPublicUrl(retryData.path);

        console.log(`   ✅ Successfully uploaded (retry): ${safeFilename}`);
        console.log(`   🔗 Public URL: ${publicUrlData.publicUrl}`);

        return {
          filename: safeFilename,
          url: publicUrlData.publicUrl,
          type: att.contentType || 'application/octet-stream',
          supabasePath: retryData.path,
          size: contentBuffer.length
        };
      }

      const { data: publicUrlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(data.path);

      console.log(`   ✅ Successfully uploaded: ${safeFilename}`);
      console.log(`   🔗 Public URL: ${publicUrlData.publicUrl}`);

      return {
        filename: safeFilename,
        url: publicUrlData.publicUrl,
        type: att.contentType || 'application/octet-stream',
        supabasePath: data.path,
        size: contentBuffer.length
      };

    } catch (attErr) {
      console.error(`   ❌ Attachment processing error for index ${index}:`, attErr.message);
      return null;
    }
  });

  const results = await Promise.allSettled(attachmentPromises);

  const successfulAttachments = results
    .filter(result => result.status === 'fulfilled' && result.value !== null)
    .map(result => result.value);

  console.log(`📎 Completed processing: ${successfulAttachments.length}/${attachments.length} successful`);

  return successfulAttachments;
}

// Open inbox helper
export function openInbox(imapConnection) {
  return new Promise((resolve, reject) => {
    imapConnection.openBox("INBOX", true, (err, box) => {
      if (err) reject(err);
      else resolve(box);
    });
  });
}

export { supabase, imapManager };