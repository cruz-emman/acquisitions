import { slidingWindow } from '@arcjet/node';
import aj from '../config/arjet.js';
import logger from '#config/logger.js';

const securityMiddleware = async (req, res, next) => {
    try {
        const role = req.user?.role || 'guest'; // Default to 'guest' if no user info

        let limit;
        let message;

        switch (role) {
            case 'admin':
                limit = 20;
                message = "Admin request limit exceeded (20 per minutes). Slow down";
            case 'user':
                limit = 10;
                message = "User request limit exceeded (10 per minutes). Slow down";
            case 'guest':
                limit = 5;
                message = "Guest request limit exceeded (5 per minutes). Slow down";
                break;
        }

        const client = aj.withRule(slidingWindow({ mode: "LIVE", interval: "1m", name: `${role}-rate-limit`, max: limit }));

        const decision = await client.protect(req)

        if (decision.isDenied && decision.reason.isBot()) {
            logger.warn(`Bot request blocked`, { ip: req.ip, userAgent: req.get('User-Agent'), path: req.path });

            return res.status(403).json({ error: "Forbidden", message: "Automated requests are not allowed" })
        }

        if (decision.isDenied && decision.reason.isShield()) {
            logger.warn(`Shiled request blocked`, { ip: req.ip, userAgent: req.get('User-Agent'), path: req.path, method: req.method });

            return res.status(403).json({ error: "Forbidden", message: "Request blocked by security policy" })
        }

        if (decision.isDenied && decision.reason.isRateLimit()) {
            logger.warn(`Rate limit exceeded`, { ip: req.ip, userAgent: req.get('User-Agent'), path: req.path, method: req.method });

            return res.status(403).json({ error: "Forbidden", message: "Rate limit exceeded" })
        }

        next();
} catch (e) {
    console.error('Arcjet error:', e);
        res.status(500).json({ error: "Internal server error", message: "Something went wrong with security check" });
    }
}

export default securityMiddleware;