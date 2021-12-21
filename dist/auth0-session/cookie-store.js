"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var assert_1 = require("assert");
var jose_1 = require("jose");
var hkdf_1 = require("./utils/hkdf");
var debug_1 = tslib_1.__importDefault(require("./utils/debug"));
var cookies_1 = require("./utils/cookies");
var cookie_1 = require("cookie");
var debug = debug_1.default('cookie-store');
var epoch = function () { return (Date.now() / 1000) | 0; }; // eslint-disable-line no-bitwise
var MAX_COOKIE_SIZE = 4096;
var alg = 'dir';
var enc = 'A256GCM';
var notNull = function (value) { return value !== null; };
var CookieStore = /** @class */ (function () {
    function CookieStore(config) {
        var _this = this;
        this.config = config;
        var secrets = Array.isArray(config.secret) ? config.secret : [config.secret];
        this.keystore = new jose_1.JWKS.KeyStore();
        secrets.forEach(function (secretString, i) {
            var key = jose_1.JWK.asKey(hkdf_1.encryption(secretString));
            if (i === 0) {
                _this.currentKey = key;
            }
            _this.keystore.add(key);
        });
        var _a = this.config.session, _b = _a.cookie, transient = _b.transient, cookieConfig = tslib_1.__rest(_b, ["transient"]), sessionName = _a.name;
        var cookieOptions = tslib_1.__assign({}, cookieConfig);
        if (!transient) {
            cookieOptions.expires = new Date();
        }
        var emptyCookie = cookie_1.serialize(sessionName + ".0", '', cookieOptions);
        this.chunkSize = MAX_COOKIE_SIZE - emptyCookie.length;
    }
    CookieStore.prototype.encrypt = function (payload, headers) {
        return jose_1.JWE.encrypt(payload, this.currentKey, tslib_1.__assign({ alg: alg,
            enc: enc }, headers));
    };
    CookieStore.prototype.decrypt = function (jwe) {
        return jose_1.JWE.decrypt(jwe, this.keystore, {
            complete: true,
            contentEncryptionAlgorithms: [enc],
            keyManagementAlgorithms: [alg]
        });
    };
    CookieStore.prototype.calculateExp = function (iat, uat) {
        var absoluteDuration = this.config.session.absoluteDuration;
        var _a = this.config.session, rolling = _a.rolling, rollingDuration = _a.rollingDuration;
        if (typeof absoluteDuration !== 'number') {
            return uat + rollingDuration;
        }
        if (!rolling) {
            return iat + absoluteDuration;
        }
        return Math.min(uat + rollingDuration, iat + absoluteDuration);
    };
    CookieStore.prototype.read = function (req) {
        var _a;
        var cookies = cookies_1.getAll(req);
        var _b = this.config.session, sessionName = _b.name, rollingDuration = _b.rollingDuration, absoluteDuration = _b.absoluteDuration;
        var iat;
        var uat;
        var exp;
        var existingSessionValue;
        try {
            if (sessionName in cookies) {
                // get JWE from unchunked session cookie
                debug('reading session from %s cookie', sessionName);
                existingSessionValue = cookies[sessionName];
            }
            else if (sessionName + ".0" in cookies) {
                // get JWE from chunked session cookie
                // iterate all cookie names
                // match and filter for the ones that match sessionName.<number>
                // sort by chunk index
                // concat
                existingSessionValue = Object.entries(cookies)
                    .map(function (_a) {
                    var _b = tslib_1.__read(_a, 2), cookie = _b[0], value = _b[1];
                    var match = cookie.match("^" + sessionName + "\\.(\\d+)$");
                    if (match) {
                        return [match[1], value];
                    }
                    return null;
                })
                    .filter(notNull)
                    .sort(function (_a, _b) {
                    var _c = tslib_1.__read(_a, 1), a = _c[0];
                    var _d = tslib_1.__read(_b, 1), b = _d[0];
                    return parseInt(a, 10) - parseInt(b, 10);
                })
                    .map(function (_a) {
                    var _b = tslib_1.__read(_a, 2), i = _b[0], chunk = _b[1];
                    debug('reading session chunk from %s.%d cookie', sessionName, i);
                    return chunk;
                })
                    .join('');
            }
            if (existingSessionValue) {
                var _c = this.decrypt(existingSessionValue), header = _c.protected, cleartext = _c.cleartext;
                (_a = header, iat = _a.iat, uat = _a.uat, exp = _a.exp);
                // check that the existing session isn't expired based on options when it was established
                assert_1.strict(exp > epoch(), 'it is expired based on options when it was established');
                // check that the existing session isn't expired based on current rollingDuration rules
                if (rollingDuration) {
                    assert_1.strict(uat + rollingDuration > epoch(), 'it is expired based on current rollingDuration rules');
                }
                // check that the existing session isn't expired based on current absoluteDuration rules
                if (typeof absoluteDuration === 'number') {
                    assert_1.strict(iat + absoluteDuration > epoch(), 'it is expired based on current absoluteDuration rules');
                }
                return [JSON.parse(cleartext.toString()), iat];
            }
        }
        catch (err) {
            /* istanbul ignore else */
            if (err instanceof assert_1.AssertionError) {
                debug('existing session was rejected because', err.message);
            }
            else if (err instanceof jose_1.errors.JOSEError) {
                debug('existing session was rejected because it could not be decrypted', err);
            }
            else {
                debug('unexpected error handling session', err);
            }
        }
        return [];
    };
    CookieStore.prototype.save = function (req, res, session, createdAt) {
        var e_1, _a, e_2, _b;
        var _c = this.config.session, _d = _c.cookie, transient = _d.transient, cookieConfig = tslib_1.__rest(_d, ["transient"]), sessionName = _c.name;
        var cookies = cookies_1.getAll(req);
        if (!session) {
            debug('clearing all matching session cookies');
            try {
                for (var _e = tslib_1.__values(Object.keys(cookies)), _f = _e.next(); !_f.done; _f = _e.next()) {
                    var cookieName = _f.value;
                    if (cookieName.match("^" + sessionName + "(?:\\.\\d)?$")) {
                        cookies_1.clear(res, cookieName, {
                            domain: cookieConfig.domain,
                            path: cookieConfig.path
                        });
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_f && !_f.done && (_a = _e.return)) _a.call(_e);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return;
        }
        var uat = epoch();
        var iat = typeof createdAt === 'number' ? createdAt : uat;
        var exp = this.calculateExp(iat, uat);
        var cookieOptions = tslib_1.__assign({}, cookieConfig);
        if (!transient) {
            cookieOptions.expires = new Date(exp * 1000);
        }
        debug('found session, creating signed session cookie(s) with name %o(.i)', sessionName);
        var value = this.encrypt(JSON.stringify(session), { iat: iat, uat: uat, exp: exp });
        var chunkCount = Math.ceil(value.length / this.chunkSize);
        if (chunkCount > 1) {
            debug('cookie size greater than %d, chunking', this.chunkSize);
            for (var i = 0; i < chunkCount; i++) {
                var chunkValue = value.slice(i * this.chunkSize, (i + 1) * this.chunkSize);
                var chunkCookieName = sessionName + "." + i;
                cookies_1.set(res, chunkCookieName, chunkValue, cookieOptions);
            }
            if (sessionName in cookies) {
                cookies_1.clear(res, sessionName, {
                    domain: cookieConfig.domain,
                    path: cookieConfig.path
                });
            }
        }
        else {
            cookies_1.set(res, sessionName, value, cookieOptions);
            try {
                for (var _g = tslib_1.__values(Object.keys(cookies)), _h = _g.next(); !_h.done; _h = _g.next()) {
                    var cookieName = _h.value;
                    if (cookieName.match("^" + sessionName + "\\.\\d$")) {
                        cookies_1.clear(res, cookieName, {
                            domain: cookieConfig.domain,
                            path: cookieConfig.path
                        });
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_h && !_h.done && (_b = _g.return)) _b.call(_g);
                }
                finally { if (e_2) throw e_2.error; }
            }
        }
    };
    return CookieStore;
}());
exports.default = CookieStore;
//# sourceMappingURL=cookie-store.js.map