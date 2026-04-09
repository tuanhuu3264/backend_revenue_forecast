const bcrypt = require("bcryptjs");
const { signAccessToken } = require("../middleware/jwt");

const MIN_PASSWORD_LEN = 6;

class AuthService {
  /**
   * @param {{ config: object; userRepository: import("../repositories/user_repository").UserRepository }} deps
   */
  constructor({ config, userRepository }) {
    this.config = config;
    this.userRepository = userRepository;
  }

  register(email, password) {
    const e = String(email || "").trim().toLowerCase();
    const p = String(password || "");
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      throw new Error("Invalid email");
    }
    if (p.length < MIN_PASSWORD_LEN) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
    }
    if (this.userRepository.findByEmail(e)) {
      throw new Error("Email already registered");
    }
    const passwordHash = bcrypt.hashSync(p, 10);
    const user = this.userRepository.create(e, passwordHash);
    const token = signAccessToken(this.config, user);
    return { token, user: { id: user.id, email: user.email } };
  }

  login(email, password) {
    const e = String(email || "").trim().toLowerCase();
    const p = String(password || "");
    const row = this.userRepository.findByEmail(e);
    if (!row || !bcrypt.compareSync(p, row.password_hash)) {
      throw new Error("Invalid email or password");
    }
    const user = { id: row.id, email: row.email };
    const token = signAccessToken(this.config, user);
    return { token, user };
  }
}

module.exports = { AuthService };
