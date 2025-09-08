const authMiddleware = (req, res, next) => {
  const apiKeyHeader = process.env.API_KEY_HEADER || 'X-API-Key';
  const apiKey = req.headers[apiKeyHeader.toLowerCase()];
  const expectedApiKey = process.env.API_KEY;

  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      message: `Please provide a valid API key in the ${apiKeyHeader} header`
    });
  }

  if (apiKey !== expectedApiKey) {
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'The provided API key does not match'
    });
  }

  req.apiKey = apiKey; // store for logging if needed
  next();
};

export { authMiddleware };