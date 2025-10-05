import { ensureMongoConnection, supabase, getFromCache, setToCache } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mongoDb = await ensureMongoConnection();
    if (!mongoDb) {
      // Fallback to Supabase if MongoDB not available
      const { search = "", sort = "date_desc", page = 1, limit = 20 } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;

      let query = supabase
        .from('emails')
        .select('*', { count: 'exact' });

      if (search && search.trim().length > 0) {
        query = query.or(`subject.ilike.%${search.trim()}%,from_text.ilike.%${search.trim()}%`);
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
        default: // date_desc
          query = query.order('date', { ascending: false });
      }

      query = query.range(from, to);

      const { data: emails, error, count } = await query;

      if (error) throw error;

      const hasMore = to < count - 1;

      const response = {
        emails: emails || [],
        total: count || 0,
        hasMore,
        page: pageNum,
        limit: limitNum,
        source: 'supabase_fallback'
      };

      res.json(response);
      return;
    }

    const { search = "", sort = "date_desc", page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Create cache key
    const cacheKey = `emails:${search}:${sort}:${pageNum}:${limitNum}`;
    const cached = getFromCache(cacheKey);

    if (cached) {
      console.log("📦 Serving from cache");
      return res.json(cached);
    }

    // Build query for search
    let query = {};
    if (search && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query = {
        $or: [
          { subject: searchRegex },
          { from: searchRegex },
        ]
      };
    }

    // Build sort
    let sortOption = {};
    switch (sort) {
      case "date_asc":
        sortOption = { date: 1 };
        break;
      case "subject_asc":
        sortOption = { subject: 1 };
        break;
      case "subject_desc":
        sortOption = { subject: -1 };
        break;
      default: // date_desc
        sortOption = { date: -1 };
    }

    const emails = await mongoDb.collection("emails")
      .find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const total = await mongoDb.collection("emails").countDocuments(query);
    const hasMore = skip + emails.length < total;

    const response = {
      emails,
      total,
      hasMore,
      page: pageNum,
      limit: limitNum,
      source: 'mongodb'
    };

    setToCache(cacheKey, response);

    res.json(response);

  } catch (error) {
    console.error("❌ MongoDB fetch error:", error);
    res.status(500).json({ error: "Failed to fetch emails from databases" });
  }
}