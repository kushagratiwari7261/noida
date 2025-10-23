// Simple test endpoint
app.get("/api/test-supabase", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('emails')
      .select('count')
      .eq('user_id', req.user.id)
      .limit(1);

    if (error) throw error;

    res.json({
      success: true,
      message: "Supabase query successful",
      user: req.user.email,
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});