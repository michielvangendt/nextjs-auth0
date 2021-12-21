"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var url_join_1 = tslib_1.__importDefault(require("url-join"));
var assert_1 = require("assert");
var get_login_state_1 = require("../hooks/get-login-state");
var debug_1 = tslib_1.__importDefault(require("../utils/debug"));
var errors_1 = require("../../utils/errors");
var debug = debug_1.default('handlers');
function getRedirectUri(config) {
    return url_join_1.default(config.baseURL, config.routes.callback);
}
function loginHandlerFactory(config, getClient, transientHandler) {
    var _this = this;
    return function (req, res, options) {
        if (options === void 0) { options = {}; }
        return tslib_1.__awaiter(_this, void 0, void 0, function () {
            var client, returnTo, opts, transientOpts, stateValue, usePKCE, authParams, validResponseTypes, authorizationUrl;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, getClient()];
                    case 1:
                        client = _a.sent();
                        returnTo = options.returnTo || config.baseURL;
                        opts = tslib_1.__assign({ returnTo: returnTo, getLoginState: config.getLoginState }, options);
                        // Ensure a redirect_uri, merge in configuration options, then passed-in options.
                        opts.authorizationParams = tslib_1.__assign(tslib_1.__assign({ redirect_uri: getRedirectUri(config) }, config.authorizationParams), (opts.authorizationParams || {}));
                        transientOpts = {
                            sameSite: opts.authorizationParams.response_mode === 'form_post' ? 'none' : 'lax'
                        };
                        return [4 /*yield*/, opts.getLoginState(req, opts)];
                    case 2:
                        stateValue = _a.sent();
                        if (typeof stateValue !== 'object') {
                            throw new Error('Custom state value must be an object.');
                        }
                        stateValue.nonce = transientHandler.generateNonce();
                        stateValue.returnTo = stateValue.returnTo || opts.returnTo;
                        usePKCE = opts.authorizationParams.response_type.includes('code');
                        if (usePKCE) {
                            debug('response_type includes code, the authorization request will use PKCE');
                            stateValue.code_verifier = transientHandler.generateCodeVerifier();
                        }
                        authParams = tslib_1.__assign(tslib_1.__assign(tslib_1.__assign({}, opts.authorizationParams), { nonce: transientHandler.save('nonce', req, res, transientOpts), state: transientHandler.save('state', req, res, tslib_1.__assign(tslib_1.__assign({}, transientOpts), { value: get_login_state_1.encodeState(stateValue) })) }), (usePKCE
                            ? {
                                code_challenge: transientHandler.calculateCodeChallenge(transientHandler.save('code_verifier', req, res, transientOpts)),
                                code_challenge_method: 'S256'
                            }
                            : undefined));
                        validResponseTypes = ['id_token', 'code id_token', 'code'];
                        assert_1.strict(validResponseTypes.includes(authParams.response_type), "response_type should be one of " + validResponseTypes.join(', '));
                        assert_1.strict(/\bopenid\b/.test(authParams.scope), 'scope should contain "openid"');
                        if (authParams.max_age) {
                            transientHandler.save('max_age', req, res, tslib_1.__assign(tslib_1.__assign({}, transientOpts), { value: authParams.max_age.toString() }));
                        }
                        authorizationUrl = client.authorizationUrl(authParams);
                        debug('redirecting to %s', authorizationUrl);
                        res.writeHead(302, {
                            Location: authorizationUrl
                        });
                        res.end(errors_1.htmlSafe(authorizationUrl));
                        return [2 /*return*/];
                }
            });
        });
    };
}
exports.default = loginHandlerFactory;
//# sourceMappingURL=login.js.map