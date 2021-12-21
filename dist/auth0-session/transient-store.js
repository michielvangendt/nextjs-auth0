"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCookieValue = void 0;
var tslib_1 = require("tslib");
var openid_client_1 = require("openid-client");
var jose_1 = require("jose");
var hkdf_1 = require("./utils/hkdf");
var cookies_1 = require("./utils/cookies");
var header = { alg: 'HS256', b64: false, crit: ['b64'] };
var getPayload = function (cookie, value) { return Buffer.from(cookie + "=" + value); };
var flattenedJWSFromCookie = function (cookie, value, signature) { return ({
    protected: Buffer.from(JSON.stringify(header))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_'),
    payload: getPayload(cookie, value),
    signature: signature
}); };
var generateSignature = function (cookie, value, key) {
    var payload = getPayload(cookie, value);
    return jose_1.JWS.sign.flattened(payload, key, header).signature;
};
var verifySignature = function (cookie, value, signature, keystore) {
    try {
        return !!jose_1.JWS.verify(flattenedJWSFromCookie(cookie, value, signature), keystore, {
            algorithms: ['HS256'],
            crit: ['b64']
        });
    }
    catch (err) {
        return false;
    }
};
var getCookieValue = function (cookie, value, keystore) {
    var _a;
    if (!value) {
        return undefined;
    }
    var signature;
    _a = tslib_1.__read(value.split('.'), 2), value = _a[0], signature = _a[1];
    if (verifySignature(cookie, value, signature, keystore)) {
        return value;
    }
    return undefined;
};
var generateCookieValue = function (cookie, value, key) {
    var signature = generateSignature(cookie, value, key);
    return value + "." + signature;
};
exports.generateCookieValue = generateCookieValue;
var TransientStore = /** @class */ (function () {
    function TransientStore(config) {
        this.config = config;
        var current;
        var secret = config.secret;
        var secrets = Array.isArray(secret) ? secret : [secret];
        var keystore = new jose_1.JWKS.KeyStore();
        secrets.forEach(function (secretString, i) {
            var key = jose_1.JWK.asKey(hkdf_1.signing(secretString));
            if (i === 0) {
                current = key;
            }
            keystore.add(key);
        });
        this.currentKey = current;
        this.keyStore = keystore;
    }
    /**
     * Set a cookie with a value or a generated nonce.
     *
     * @param {String} key Cookie name to use.
     * @param {IncomingMessage} _req Server Request object.
     * @param {ServerResponse} res Server Response object.
     * @param {Object} opts Options object.
     * @param {String} opts.sameSite SameSite attribute of "None," "Lax," or "Strict". Default is "None."
     * @param {String} opts.value Cookie value. Omit this key to store a generated value.
     *
     * @return {String} Cookie value that was set.
     */
    TransientStore.prototype.save = function (key, _req, res, _a) {
        var _b = _a.sameSite, sameSite = _b === void 0 ? 'none' : _b, _c = _a.value, value = _c === void 0 ? this.generateNonce() : _c;
        var isSameSiteNone = sameSite === 'none';
        var _d = this.config.session.cookie, domain = _d.domain, path = _d.path, secure = _d.secure;
        var basicAttr = {
            httpOnly: true,
            secure: secure,
            domain: domain,
            path: path
        };
        {
            var cookieValue = exports.generateCookieValue(key, value, this.currentKey);
            // Set the cookie with the SameSite attribute and, if needed, the Secure flag.
            cookies_1.set(res, key, cookieValue, tslib_1.__assign(tslib_1.__assign({}, basicAttr), { sameSite: sameSite, secure: isSameSiteNone ? true : basicAttr.secure }));
        }
        if (isSameSiteNone && this.config.legacySameSiteCookie) {
            var cookieValue = exports.generateCookieValue("_" + key, value, this.currentKey);
            // Set the fallback cookie with no SameSite or Secure attributes.
            cookies_1.set(res, "_" + key, cookieValue, basicAttr);
        }
        return value;
    };
    /**
     * Get a cookie value then delete it.
     *
     * @param {String} key Cookie name to use.
     * @param {IncomingMessage} req Express Request object.
     * @param {ServerResponse} res Express Response object.
     *
     * @return {String|undefined} Cookie value or undefined if cookie was not found.
     */
    TransientStore.prototype.read = function (key, req, res) {
        var cookie = cookies_1.get(req, key);
        var _a = this.config.session.cookie, domain = _a.domain, path = _a.path;
        var value = getCookieValue(key, cookie, this.keyStore);
        cookies_1.clear(res, key, { domain: domain, path: path });
        if (this.config.legacySameSiteCookie) {
            var fallbackKey = "_" + key;
            if (!value) {
                var fallbackCookie = cookies_1.get(req, fallbackKey);
                value = getCookieValue(fallbackKey, fallbackCookie, this.keyStore);
            }
            cookies_1.clear(res, fallbackKey, { domain: domain, path: path });
        }
        return value;
    };
    /**
     * Generates a nonce value.
     * @return {String}
     */
    TransientStore.prototype.generateNonce = function () {
        return openid_client_1.generators.nonce();
    };
    /**
     * Generates a code_verifier value.
     * @return {String}
     */
    TransientStore.prototype.generateCodeVerifier = function () {
        return openid_client_1.generators.codeVerifier();
    };
    /**
     * Calculates a code_challenge value for a given codeVerifier
     * @param {String} codeVerifier Code Verifier to calculate the code_challenge value from.
     * @return {String}
     */
    TransientStore.prototype.calculateCodeChallenge = function (codeVerifier) {
        return openid_client_1.generators.codeChallenge(codeVerifier);
    };
    return TransientStore;
}());
exports.default = TransientStore;
//# sourceMappingURL=transient-store.js.map