const jwt = require("jsonwebtoken");

/**
 * @param {object} config
 * @param {{ id: number; email: string }} user
 */
function signAccessToken(config, user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * @param {object} config
 * @param {string} token
 */
function verifyAccessToken(config, token) {
  return jwt.verify(token, config.jwtSecret);
}

/**
 * @param {object} config
 * @returns {import("express").RequestHandler}
 */
function requireJwt(config) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ message: "Missing or invalid Authorization header" });
      return;
    }
    const token = header.slice(7).trim();
    if (!token) {
      res.status(401).json({ message: "Missing bearer token" });
      return;
    }
    try {
      const payload = verifyAccessToken(config, token);
      const id = Number(payload.sub);
      if (!Number.isFinite(id) || id < 1) {
        res.status(401).json({ message: "Invalid token subject" });
        return;
      }
      req.user = { id, email: payload.email };
      next();
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
    }
  };
}

module.exports = { signAccessToken, verifyAccessToken, requireJwt };
