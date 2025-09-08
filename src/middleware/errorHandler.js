const errorHandler = (error, req, res, next) => {
  console.error('Error occurred:', error);

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(e => e.message);
    return res.status(400).json({
      error: 'Validation Error',
      message: errors.join(', ')
    });
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: 'A digital link with this identifier, linkType, and link already exists'
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (error.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID',
      message: 'The provided ID is not valid'
    });
  }

  // Default error
  res.status(error.status || 500).json({
    error: error.message || 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.stack : 'Something went wrong'
  });
};

export { errorHandler };
