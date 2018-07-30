'use strict';

/* global it, describe, before, beforeEach, after, afterEach, slow, URL */

const assert = require('chai').assert;
const crypto = require('crypto');
const request = require('request');
const qs = require('querystring');
const consts = require('./testConsts');
const wicked = require('wicked-sdk');
const async = require('async');

const utils = {};

// utils.SCOPES = {

// }

utils.createRandomId = function () {
    return crypto.randomBytes(5).toString('hex');
};

utils.getJson = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return JSON.parse(ob);
    return ob;
};

utils.getText = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return ob;
    return JSON.stringify(ob, null, 2);
};

///

let _echoPlan;
function getEchoPlan(callback) {
    if (_echoPlan)
        return callback(null, _echoPlan);
    wicked.getApiPlans('echo', function (err, plans) {
        assert.isNotOk(err);
        assert.isOk(plans);
        assert.isArray(plans);
        _echoPlan = plans[0].id;
        return callback(null, _echoPlan);
    });
}

utils.createUsers = function (callback) {
    async.series({
        deleteUsers: callback => utils.destroyUsers(callback),
        normal: function (callback) {
            wicked.createUser({
                email: 'normal@user.com',
                password: 'normalwicked',
                validated: true,
                groups: ['dev']
            }, function (err, userInfo) {
                assert.isNotOk(err);
                userInfo.password = 'normalwicked';
                return callback(null, userInfo);
            });
        },
        admin: function (callback) {
            wicked.createUser({
                email: 'admin@user.com',
                password: 'adminwicked',
                validated: true,
                groups: ['admin']
            }, function (err, userInfo) {
                assert.isNotOk(err);
                userInfo.password = 'adminwicked';
                return callback(null, userInfo);
            });
        }
    }, function (err, results) {
        if (err)
            console.error(err);
        assert.isNotOk(err);
        return callback(null, results);
    });
};

utils.deleteUserByEmail = function (email, callback) {
    wicked.getUserByEmail(email, function (err, shortInfos) {
        if (err && err.status === 404)
            return callback(null);
        assert.isNotOk(err);
        if (shortInfos.length === 0)
            return callback(null);
        assert.equal(1, shortInfos.length);
        const shortInfo = shortInfos[0];
        wicked.deleteUser(shortInfo.id, callback);
    });
};

utils.destroyUsers = function (callback) {
    async.series([
        callback => utils.deleteUserByEmail('normal@user.com', callback),
        callback => utils.deleteUserByEmail('admin@user.com', callback)
    ], function (err) {
        if (err)
            console.error(err);
        assert.isNotOk();
        callback(null);
    });
};

function createTrustedApp(echoPlan, callback) {
    const appId = consts.APP_ID + '-trusted';
    wicked.createApplication({
        id: appId,
        name: appId,
        confidential: true,
        redirectUri: consts.REDIRECT_URI
    }, function (err, appInfo) {
        if (err)
            return callback(err);
        wicked.createSubscription(appId, {
            api: 'echo',
            application: appId,
            auth: 'oauth2',
            plan: echoPlan,
            trusted: true
        }, function (err, subs) {
            if (err)
                return callback(err);
            return callback(null, {
                clientId: subs.clientId,
                clientSecret: subs.clientSecret,
                redirectUri: consts.REDIRECT_URI
            });
        });
    });
}

function createConfidentialApp(echoPlan, callback) {
    const appId = consts.APP_ID + '-confidential';
    wicked.createApplication({
        id: appId,
        name: appId,
        confidential: true,
        redirectUri: consts.REDIRECT_URI
    }, function (err, appInfo) {
        if (err)
            return callback(err);
        wicked.createSubscription(appId, {
            api: 'echo',
            application: appId,
            auth: 'oauth2',
            plan: echoPlan,
            trusted: false
        }, function (err, subs) {
            if (err)
                return callback(err);
            return callback(null, {
                clientId: subs.clientId,
                clientSecret: subs.clientSecret,
                redirectUri: consts.REDIRECT_URI
            });
        });
    });
}

function createPublicApp(echoPlan, callback) {
    const appId = consts.APP_ID + '-public';
    wicked.createApplication({
        id: appId,
        name: appId,
        confidential: false,
        redirectUri: consts.REDIRECT_URI
    }, function (err, appInfo) {
        if (err)
            return callback(err);
        wicked.createSubscription(appId, {
            api: 'echo',
            application: appId,
            auth: 'oauth2',
            plan: echoPlan,
            trusted: true
        }, function (err, subs) {
            if (err)
                return callback(err);
            return callback(null, {
                clientId: subs.clientId,
                clientSecret: subs.clientSecret,
                redirectUri: consts.REDIRECT_URI
            });
        });
    });
}

function createWithoutUriApp(echoPlan, callback) {
    const appId = consts.APP_ID + '-withouturi';
    wicked.createApplication({
        id: appId,
        name: appId,
        confidential: true
    }, function (err, appInfo) {
        if (err)
            return callback(err);
        wicked.createSubscription(appId, {
            api: 'echo',
            application: appId,
            auth: 'oauth2',
            plan: echoPlan,
            trusted: false
        }, function (err, subs) {
            if (err)
                return callback(err);
            return callback(null, {
                clientId: subs.clientId,
                clientSecret: subs.clientSecret
            });
        });
    });
}

utils.initAppsAndSubscriptions = function (callback) {
    let now = new Date().getTime();
    utils.destroyAppsAndSubcriptions(function (err) {
        console.log('Destroying previous apps: ' + (new Date().getTime() - now) + 'ms.');
        now = new Date().getTime();
        getEchoPlan(function (err, echoPlan) {
            async.series({
                users: callback => utils.createUsers(callback),
                trusted: callback => createTrustedApp(echoPlan, callback),
                confidential: callback => createConfidentialApp(echoPlan, callback),
                public: callback => createPublicApp(echoPlan, callback),
                withoutUri: callback => createWithoutUriApp(echoPlan, callback),
                awaitQueue: callback => utils.awaitEmptyAdapterQueue(callback)
            }, function (err, results) {
                console.log('Creating and propagating new apps: ' + (new Date().getTime() - now) + 'ms.');
                if (err)
                    console.error(err);
                assert.isNotOk(err);

                delete results.awaitQueue;
                return callback(null, results);
            });
        });
    });
};

function deleteApplication(appId, callback) {
    wicked.getApplication(appId, function (err, appInfo) {
        if (err && err.statusCode !== 404)
            return callback(err);
        if (err && err.statusCode === 404)
            return callback(null);
        // console.log('DELETE ' + appId);
        wicked.deleteApplication(appId, callback);
    });
}

utils.destroyAppsAndSubcriptions = function (done) {
    async.series([
        callback => deleteApplication(consts.APP_ID + '-trusted', callback),
        callback => deleteApplication(consts.APP_ID + '-confidential', callback),
        callback => deleteApplication(consts.APP_ID + '-public', callback),
        callback => deleteApplication(consts.APP_ID + '-withouturi', callback),
        callback => utils.destroyUsers(callback),
        callback => utils.awaitEmptyAdapterQueue(callback)
    ], function (err) {
        assert.isNotOk(err);
        return done();
    });
};

utils.ensureNoSlash = function (s) {
    if (s.endsWith('/'))
        return s.substring(0, s.length - 1);
    return s;
};

utils.ensureSlash = function (s) {
    if (!s.endsWith('/'))
        return s + '/';
    return s;
};

let _authServerUrl;
utils.getAuthServerUrl = function (callback) {
    if (_authServerUrl)
        return callback(null, _authServerUrl);
    wicked.getAuthServer('default', function (err, as) {
        if (err)
            return callback(err);
        const apiUrl = utils.ensureNoSlash(wicked.getExternalApiUrl());
        const authPath = as.config.api.uris[0];
        _authServerUrl = utils.ensureSlash(apiUrl + authPath);
        return callback(null, _authServerUrl);
    });
};


utils.authGet = function (urlPath, cookieJar, callback) {
    assert.notEqual(urlPath[0], '/', 'Do not prepend the url path with a /');
    if (typeof cookieJar === 'function' && !callback)
        callback = cookieJar;
    const corrId = utils.createRandomId();
    if (process.env.OUTPUT_CORRELATION_IDS)
        console.log(`GET ${urlPath}: Correlation-Id ${corrId}`);
    utils.getAuthServerUrl(function (err, authUrl) {
        assert.isNotOk(err);
        request.get({
            url: authUrl + urlPath,
            headers: {
                'Accept': 'application/json',
                'Correlation-Id': corrId
            },
            jar: cookieJar
        }, function (err, res, body) {
            assert.isNotOk(err);
            const contentType = res.headers["content-type"];
            if (contentType && contentType.indexOf('application/json') >= 0)
                return callback(null, res, utils.getJson(body));
            return callback(null, res, body);
        });
    });
};

utils.authPost = function (urlPath, body, cookieJar, callback) {
    if (typeof cookieJar === 'function' && !callback)
        callback = cookieJar;
    assert.notEqual(urlPath[0], '/', 'Do not prepend the url path with a /');
    const corrId = utils.createRandomId();
    if (process.env.OUTPUT_CORRELATION_IDS)
        console.log(`POST ${urlPath}: Correlation-Id ${corrId}`);
    utils.getAuthServerUrl(function (err, authUrl) {
        assert.isNotOk(err);
        request.post({
            url: authUrl + urlPath,
            headers: {
                'Accept': 'application/json',
                'Correlation-Id': corrId
            },
            jar: cookieJar,
            json: true,
            body: body
        }, function (err, res, body) {
            assert.isNotOk(err);
            const contentType = res.headers["content-type"];
            if (contentType && contentType.indexOf('application/json') >= 0)
                return callback(null, res, utils.getJson(body));
            return callback(null, res, body);
        });
    });
};

utils.assertIsHtml = function (body) {
    assert.isTrue(body.would_be_html);
};

utils.assertIsNotHtml = function (body) {
    assert.isFalse(body.would_be_html);
};

utils.awaitEmptyAdapterQueue = function (callback) {
    const maxCount = 40;
    const timeOut = 250;
    const _awaitEmptyQueue = function (tryCount) {
        // console.log('_awaitEmptyQueue(), try ' + tryCount);
        if (tryCount >= maxCount)
            return callback(new Error('awaitEmptyQueue: Max count of ' + maxCount + ' was reached: ' + tryCount));
        wicked.getWebhookEvents('kong-adapter', function (err, events) {
            assert.isNotOk(err);
            // console.log(events);
            if (events.length === 0) {
                if (tryCount > 7)
                    console.log('INFO: awaitEmptyQueue needed ' + tryCount + ' tries.');
                return callback(null);
            }
            setTimeout(_awaitEmptyQueue, timeOut, tryCount + 1);
        });
    };

    // Let the queue build up first before hammering the API.
    setTimeout(_awaitEmptyQueue, 250, 1);
};

utils.getAuthCode = function (cookieJar, apiId, client, user, scope, callback) {
    let url = `local/api/${apiId}/authorize?response_type=code&client_id=${client.clientId}&redirect_uri=${client.redirectUri}`;
    if (scope) {
        const scopeString = scope.join(' ');
        url += `&scope=${qs.escape(scopeString)}`;
    }
    utils.authGet(url, cookieJar, function (err, res, body) {
        const csrfToken = body.csrfToken;
        assert.isOk(csrfToken);
        utils.authPost(body.loginUrl, {
            _csrf: csrfToken,
            username: user.email,
            password: user.password
        }, cookieJar, function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(302, res.statusCode);
            const redir = res.headers.location;
            assert.isOk(redir);
            const redirUrl = new URL(redir);
            const code = redirUrl.searchParams.get('code');
            assert.isOk(code);
            callback(null, code);
        });
    });
};

utils.getAuthCodeToken = function (cookieJar, apiId, client, user, scope, callback) {
    utils.getAuthCode(cookieJar, apiId, client, user, scope, function (err, code) {
        assert.isNotOk(err);
        assert.isOk(code);
        utils.authPost(`local/api/${apiId}/token`, {
            grant_type: 'authorization_code',
            client_id: client.clientId,
            client_secret: client.clientSecret,
            code: code
        }, function (err, res, accessToken) {
            assert.isNotOk(err);
            assert.equal(200, res.statusCode);
            assert.isOk(accessToken);
            assert.isObject(accessToken);
            assert.isOk(accessToken.access_token);
            assert.isOk(accessToken.refresh_token);
            assert.equal('bearer', accessToken.token_type);
            callback(null, accessToken);
        });
    });
};

utils.getPasswordToken = function (apiId, client, user, scope, callback) {
    const body = {
        grant_type: 'password',
        client_id: client.clientId,
        client_secret: client.clientSecret,
        username: user.email,
        password: user.password
    };
    if (scope) {
        const scopeString = scope.join(' ');
        body.scope = scope;
    }
    utils.authPost(`local/api/${apiId}/token`, body, callback);
};

const _apiUrlMap = {};
function getApiUrl(apiId, callback) {
    if (_apiUrlMap[apiId])
        return callback(null, _apiUrlMap[apiId]);
    wicked.getApiConfig(apiId, function (err, apiConfig) {
        assert.isNotOk(err);
        assert.isOk(apiConfig.api);
        assert.isOk(apiConfig.api.uris);
        const path = apiConfig.api.uris[0];
        const url = utils.ensureSlash(utils.ensureNoSlash(wicked.getExternalApiUrl()) + path);
        _apiUrlMap[apiId] = url;
        return callback(null, url);
    });
}

utils.callApi = function (apiId, accessToken, method, url, body, callback) {
    getApiUrl(apiId, function (err, apiUrl) {
        assert.isNotOk(err);
        const requestBody = {
            url: apiUrl + url,
            method: method,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        };
        if (requestBody) {
            requestBody.json = true;
            requestBody.body = body;
        }
        request(requestBody, function (err, res, body) {
            const contentType = res.headers["content-type"];
            if (contentType && contentType.indexOf('application/json') >= 0)
                return callback(null, res, utils.getJson(body));
            return callback(null, res, body);
        });
    });
};

utils.assertIsRedirectError = function (res, expectedError) {
    assert.isOk(res.headers.location);
    const redirUrl = new URL(res.headers.location);
    assert.isOk(redirUrl.searchParams);
    assert.isOk(redirUrl.searchParams.get('error'), expectedError);
};

module.exports = utils;
