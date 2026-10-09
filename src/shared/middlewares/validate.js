function validate(schema, source) {
  return (req, res, next) => {
    try {
      req.validated ||= {};
      req.validated[source] = schema.parse(req[source]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { validate };
